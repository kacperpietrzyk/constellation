import EventKit
import Foundation

struct Capability: Encodable {
    let platform = "macos"
    let provider = "eventkit"
    let availability: String
    let canRead: Bool
    let canWriteOwnedBlocks: Bool
    let detailCode: String
}

struct AttendeeProjection: Encodable {
    let externalId: String?
    let name: String
    let email: String?
    let organizer: Bool
    let response: String
}

struct EventProjection: Encodable {
    let provider = "eventkit"
    let calendarExternalId: String
    let eventExternalId: String
    let revision: String
    let title: String
    let startsAt: String
    let endsAt: String
    let isAllDay: Bool
    let location: String?
    let attendees: [AttendeeProjection]
}

struct ReadRequest: Decodable { let from: String; let to: String }
struct WriteRequest: Decodable { let blocks: [Block] }
struct Block: Decodable {
    let calendarExternalId: String
    let ownedBlockExternalId: String
    let title: String
    let startsAt: String
    let endsAt: String
    let expectedRevision: String?
    let sourceRecordIds: [String]
}
struct ReadResponse: Encodable { let capability: Capability; let events: [EventProjection] }
struct WriteResponse: Encodable { let outcome: String; let revisions: [String]?; let code: String? }

let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]
let iso = ISO8601DateFormatter()

func emit<T: Encodable>(_ value: T) -> Never {
    do {
        FileHandle.standardOutput.write(try encoder.encode(value))
        FileHandle.standardOutput.write(Data("\n".utf8))
        exit(0)
    } catch {
        FileHandle.standardError.write(Data("Could not encode EventKit response.\n".utf8))
        exit(70)
    }
}

func capability() -> Capability {
    let status = EKEventStore.authorizationStatus(for: .event)
    if #available(macOS 14.0, *) {
        switch status {
        case .fullAccess: return Capability(availability: "available", canRead: true, canWriteOwnedBlocks: true, detailCode: "full_access")
        case .writeOnly: return Capability(availability: "permission_required", canRead: false, canWriteOwnedBlocks: true, detailCode: "write_only")
        case .denied, .restricted: return Capability(availability: "permission_denied", canRead: false, canWriteOwnedBlocks: false, detailCode: "access_denied")
        case .notDetermined: return Capability(availability: "permission_required", canRead: false, canWriteOwnedBlocks: false, detailCode: "not_determined")
        @unknown default: return Capability(availability: "error", canRead: false, canWriteOwnedBlocks: false, detailCode: "unknown_authorization")
        }
    }
    return status.rawValue == 3
        ? Capability(availability: "available", canRead: true, canWriteOwnedBlocks: true, detailCode: "legacy_authorized")
        : Capability(availability: "permission_required", canRead: false, canWriteOwnedBlocks: false, detailCode: "legacy_not_authorized")
}

guard CommandLine.arguments.count == 3,
      let requestData = Data(base64Encoded: CommandLine.arguments[2]) else {
    FileHandle.standardError.write(Data("Expected read/write and a base64 JSON payload.\n".utf8))
    exit(64)
}

let store = EKEventStore()
let currentCapability = capability()

if CommandLine.arguments[1] == "request-access" {
    let semaphore = DispatchSemaphore(value: 0)
    if #available(macOS 14.0, *) {
        store.requestFullAccessToEvents { _, _ in semaphore.signal() }
    } else {
        store.requestAccess(to: .event) { _, _ in semaphore.signal() }
    }
    _ = semaphore.wait(timeout: .now() + 30)
    emit(ReadResponse(capability: capability(), events: []))
}

if CommandLine.arguments[1] == "read" {
    guard currentCapability.canRead,
          let request = try? JSONDecoder().decode(ReadRequest.self, from: requestData),
          let from = iso.date(from: request.from),
          let to = iso.date(from: request.to), to > from else {
        emit(ReadResponse(capability: currentCapability, events: []))
    }
    let events = store.events(matching: store.predicateForEvents(withStart: from, end: to, calendars: nil))
        .sorted { $0.startDate < $1.startDate }
        .map { event in
            EventProjection(
                calendarExternalId: event.calendar.calendarIdentifier,
                eventExternalId: event.calendarItemExternalIdentifier,
                revision: event.lastModifiedDate.map { iso.string(from: $0) } ?? "unknown",
                title: event.title ?? "Untitled event",
                startsAt: iso.string(from: event.startDate),
                endsAt: iso.string(from: event.endDate),
                isAllDay: event.isAllDay,
                location: event.location,
                attendees: (event.attendees ?? []).map { attendee in
                    AttendeeProjection(
                        externalId: attendee.url.absoluteString,
                        name: attendee.name ?? "Unknown attendee",
                        email: attendee.url.scheme == "mailto" ? String(attendee.url.absoluteString.dropFirst("mailto:".count)) : nil,
                        organizer: attendee.url == event.organizer?.url,
                        response: {
                            switch attendee.participantStatus {
                            case .accepted: return "accepted"
                            case .declined: return "declined"
                            case .tentative: return "tentative"
                            case .pending, .delegated: return "needs_action"
                            default: return "unknown"
                            }
                        }()
                    )
                }
            )
        }
    emit(ReadResponse(capability: currentCapability, events: events))
}

guard CommandLine.arguments[1] == "write",
      currentCapability.canWriteOwnedBlocks,
      let request = try? JSONDecoder().decode(WriteRequest.self, from: requestData) else {
    emit(WriteResponse(outcome: "rejected", revisions: nil, code: "permission_denied"))
}

do {
    var writtenEvents: [EKEvent] = []
    for block in request.blocks {
        guard let start = iso.date(from: block.startsAt),
              let end = iso.date(from: block.endsAt), end > start,
              let calendar = store.calendar(withIdentifier: block.calendarExternalId) else {
            emit(WriteResponse(outcome: "rejected", revisions: nil, code: "provider_error"))
        }
        guard let encodedId = block.ownedBlockExternalId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else {
            emit(WriteResponse(outcome: "rejected", revisions: nil, code: "provider_error"))
        }
        let marker = "constellation://calendar-block/\(encodedId)"
        let matches = store.events(matching: store.predicateForEvents(withStart: start.addingTimeInterval(-86400), end: end.addingTimeInterval(86400), calendars: [calendar]))
            .filter { $0.url?.absoluteString == marker }
        if (matches.first == nil) != (block.expectedRevision == nil) {
            emit(WriteResponse(outcome: "rejected", revisions: nil, code: "stale_revision"))
        }
        let event = matches.first ?? EKEvent(eventStore: store)
        if let expected = block.expectedRevision,
           event.lastModifiedDate.map({ iso.string(from: $0) }) != expected {
            emit(WriteResponse(outcome: "rejected", revisions: nil, code: "stale_revision"))
        }
        event.calendar = calendar
        event.title = block.title
        event.startDate = start
        event.endDate = end
        event.url = URL(string: marker)
        event.notes = "Constellation work block · sources: \(block.sourceRecordIds.joined(separator: ","))"
        try store.save(event, span: .thisEvent, commit: false)
        writtenEvents.append(event)
    }
    try store.commit()
    let revisions = writtenEvents.map { event in
        event.lastModifiedDate.map { iso.string(from: $0) } ?? event.eventIdentifier ?? "unknown"
    }
    emit(WriteResponse(outcome: "applied", revisions: revisions, code: nil))
} catch {
    store.reset()
    emit(WriteResponse(outcome: "rejected", revisions: nil, code: "provider_error"))
}
