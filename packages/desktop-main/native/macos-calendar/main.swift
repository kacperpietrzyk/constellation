import EventKit
import CryptoKit
import Foundation

struct Capability: Encodable {
    let platform = "macos"
    let provider = "eventkit"
    let availability: String
    let canRead: Bool
    let canWriteOwnedBlocks: Bool
    let detailCode: String
    // Where a block with no event of its own should be written. A meeting
    // block inherits its calendar from the event it prepares; a Task has no
    // event, so without this there is no honest target. Absent when we cannot
    // write, or when EventKit reports no default writable calendar.
    var defaultWriteCalendarExternalId: String?
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
let fractionalIso = ISO8601DateFormatter()
fractionalIso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

func parseIsoDate(_ value: String) -> Date? {
    fractionalIso.date(from: value) ?? iso.date(from: value)
}

// EventKit-backed providers may advance lastModifiedDate after a successful
// save while assigning remote metadata, even when the user-visible event did
// not change. Use the exact owned content as the optimistic concurrency token
// so provider bookkeeping does not create an unrecoverable false conflict.
func eventRevision(_ event: EKEvent) -> String {
    let attendees = (event.attendees ?? [])
        .map { participant in
            [
                participant.url.absoluteString,
                participant.name ?? "",
                String(participant.participantStatus.rawValue),
                String(participant.participantRole.rawValue),
            ].joined(separator: ":")
        }
        .sorted()
        .joined(separator: ",")
    let recurrence = (event.recurrenceRules ?? [])
        .map { $0.description }
        .sorted()
        .joined(separator: ",")
    let alarms = (event.alarms ?? [])
        .map { alarm in
            alarm.absoluteDate.map { "absolute:\(iso.string(from: $0))" }
                ?? "relative:\(alarm.relativeOffset)"
        }
        .sorted()
        .joined(separator: ",")
    let values = [
        event.calendar.calendarIdentifier,
        event.title ?? "",
        iso.string(from: event.startDate),
        iso.string(from: event.endDate),
        event.isAllDay ? "1" : "0",
        event.location ?? "",
        event.notes ?? "",
        event.url?.absoluteString ?? "",
        event.timeZone?.identifier ?? "",
        String(event.availability.rawValue),
        attendees,
        recurrence,
        alarms,
    ]
    let canonical = values.map { "\($0.utf8.count):\($0)" }.joined(separator: "|")
    return SHA256.hash(data: Data(canonical.utf8))
        .map { String(format: "%02x", $0) }
        .joined()
}

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

// Decorates the authorization-only capability with the default write target,
// which requires the store and therefore cannot live in capability() itself.
func capabilityWithWriteTarget() -> Capability {
    var value = capability()
    guard value.canWriteOwnedBlocks else { return value }
    if let identifier = store.defaultCalendarForNewEvents?.calendarIdentifier {
        value.defaultWriteCalendarExternalId = identifier
    }
    return value
}

guard CommandLine.arguments.count == 3,
      let requestData = Data(base64Encoded: CommandLine.arguments[2]) else {
    FileHandle.standardError.write(Data("Expected read/write/delete and a base64 JSON payload.\n".utf8))
    exit(64)
}

let store = EKEventStore()
let currentCapability = capabilityWithWriteTarget()

if CommandLine.arguments[1] == "request-access" {
    let semaphore = DispatchSemaphore(value: 0)
    if #available(macOS 14.0, *) {
        store.requestFullAccessToEvents { _, _ in semaphore.signal() }
    } else {
        store.requestAccess(to: .event) { _, _ in semaphore.signal() }
    }
    _ = semaphore.wait(timeout: .now() + 30)
    emit(ReadResponse(capability: capabilityWithWriteTarget(), events: []))
}

if CommandLine.arguments[1] == "read" {
    guard currentCapability.canRead,
          let request = try? JSONDecoder().decode(ReadRequest.self, from: requestData),
          let from = parseIsoDate(request.from),
          let to = parseIsoDate(request.to), to > from else {
        emit(ReadResponse(capability: currentCapability, events: []))
    }
    let events = store.events(matching: store.predicateForEvents(withStart: from, end: to, calendars: nil))
        .sorted { $0.startDate < $1.startDate }
        .map { event in
            EventProjection(
                calendarExternalId: event.calendar.calendarIdentifier,
                eventExternalId: event.calendarItemExternalIdentifier,
                revision: eventRevision(event),
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

if CommandLine.arguments[1] == "delete" {
    guard currentCapability.canWriteOwnedBlocks,
          let request = try? JSONDecoder().decode(WriteRequest.self, from: requestData) else {
        emit(WriteResponse(outcome: "rejected", revisions: nil, code: "permission_denied"))
    }
    do {
        var events: [EKEvent] = []
        for block in request.blocks {
            guard let start = parseIsoDate(block.startsAt),
                  let end = parseIsoDate(block.endsAt), end > start,
                  let calendar = store.calendar(withIdentifier: block.calendarExternalId),
                  let expected = block.expectedRevision,
                  let encodedId = block.ownedBlockExternalId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else {
                emit(WriteResponse(outcome: "rejected", revisions: nil, code: "provider_error"))
            }
            let marker = "constellation://calendar-block/\(encodedId)"
            let matches = store.events(matching: store.predicateForEvents(withStart: start.addingTimeInterval(-86400), end: end.addingTimeInterval(86400), calendars: [calendar]))
                .filter { $0.url?.absoluteString == marker }
            guard matches.count == 1,
                  let event = matches.first,
                  eventRevision(event) == expected else {
                emit(WriteResponse(outcome: "rejected", revisions: nil, code: "stale_revision"))
            }
            events.append(event)
        }
        for event in events {
            try store.remove(event, span: .thisEvent, commit: false)
        }
        try store.commit()
        emit(WriteResponse(outcome: "applied", revisions: [], code: nil))
    } catch {
        store.reset()
        emit(WriteResponse(outcome: "rejected", revisions: nil, code: "provider_error"))
    }
}

guard CommandLine.arguments[1] == "write",
      currentCapability.canWriteOwnedBlocks,
      let request = try? JSONDecoder().decode(WriteRequest.self, from: requestData) else {
    emit(WriteResponse(outcome: "rejected", revisions: nil, code: "permission_denied"))
}

do {
    var writtenEvents: [EKEvent] = []
    for block in request.blocks {
        guard let start = parseIsoDate(block.startsAt),
              let end = parseIsoDate(block.endsAt), end > start,
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
           eventRevision(event) != expected {
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
    let revisions = writtenEvents.map(eventRevision)
    emit(WriteResponse(outcome: "applied", revisions: revisions, code: nil))
} catch {
    store.reset()
    emit(WriteResponse(outcome: "rejected", revisions: nil, code: "provider_error"))
}
