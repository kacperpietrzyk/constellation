import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultProbeRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
if (process.argv.length > 3) {
  throw new Error("usage: patch-binding.mjs [TARGET_PROBE_ROOT]");
}
const probeRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : defaultProbeRoot;
const moduleRoot = path.join(probeRoot, "node_modules", "better-sqlite3");

function replaceExact(relativePath, before, after) {
  const target = path.join(moduleRoot, relativePath);
  const source = fs.readFileSync(target, "utf8");

  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Unsupported better-sqlite3 source shape: ${relativePath}`);
  }

  fs.writeFileSync(target, source.replace(before, after));
}

replaceExact(
  "src/better_sqlite3.cpp",
  "#include <sqlite3.h>\n",
  `#include <sqlite3.h>

extern "C" int sqlite3_key_v2(
\tsqlite3* database,
\tconst char* database_name,
\tconst void* key,
\tint key_length
);
`,
);

replaceExact(
  "src/objects/database.hpp",
  "\tstatic NODE_METHOD(JS_unsafeMode);\n",
  "\tstatic NODE_METHOD(JS_unsafeMode);\n\tstatic NODE_METHOD(JS_key);\n\tstatic NODE_METHOD(JS_keyAttachedExport);\n",
);

replaceExact(
  "src/objects/database.cpp",
  '\tSetPrototypeMethod(isolate, data, t, "unsafeMode", JS_unsafeMode);\n',
  '\tSetPrototypeMethod(isolate, data, t, "unsafeMode", JS_unsafeMode);\n\tSetPrototypeMethod(isolate, data, t, "key", JS_key);\n\tSetPrototypeMethod(isolate, data, t, "keyAttachedExport", JS_keyAttachedExport);\n',
);

replaceExact(
  "src/objects/database.cpp",
  "\tint status = sqlite3_db_config(db_handle, SQLITE_DBCONFIG_ENABLE_LOAD_EXTENSION, 1, NULL);\n",
  "\tint status = sqlite3_db_config(db_handle, SQLITE_DBCONFIG_ENABLE_LOAD_EXTENSION, 0, NULL);\n",
);

replaceExact(
  "src/objects/database.cpp",
  `NODE_METHOD(Database::JS_loadExtension) {
\tDatabase* db = Unwrap<Database>(info.This());
\tv8::Local<v8::String> entryPoint;
\tREQUIRE_ARGUMENT_STRING(first, v8::Local<v8::String> filename);
\tif (info.Length() > 1) { REQUIRE_ARGUMENT_STRING(second, entryPoint); }
\tREQUIRE_DATABASE_OPEN(db);
\tREQUIRE_DATABASE_NOT_BUSY(db);
\tREQUIRE_DATABASE_NO_ITERATORS(db);
\tUseIsolate;
\tchar* error;
\tint status = sqlite3_load_extension(
\t\tdb->db_handle,
\t\t*v8::String::Utf8Value(isolate, filename),
\t\tentryPoint.IsEmpty() ? NULL : *v8::String::Utf8Value(isolate, entryPoint),
\t\t&error
\t);
\tif (status != SQLITE_OK) {
\t\tThrowSqliteError(db->addon, error, status);
\t}
\tsqlite3_free(error);
}
`,
  `NODE_METHOD(Database::JS_loadExtension) {
\treturn ThrowTypeError("Loadable extensions are disabled");
}
`,
);

replaceExact(
  "src/objects/database.cpp",
  "NODE_GETTER(Database::JS_open) {\n",
  `namespace {
int ApplyRawKey(sqlite3* database, const char* database_name, const char* key_bytes) {
\tstatic constexpr char HEX[] = "0123456789abcdef";
\tchar raw_key[67];
\traw_key[0] = 'x';
\traw_key[1] = '\\'';
\tfor (size_t index = 0; index < 32; ++index) {
\t\tconst unsigned char value = static_cast<unsigned char>(key_bytes[index]);
\t\traw_key[2 + (index * 2)] = HEX[value >> 4];
\t\traw_key[3 + (index * 2)] = HEX[value & 0x0f];
\t}
\traw_key[66] = '\\'';
\tconst int status = sqlite3_key_v2(
\t\tdatabase,
\t\tdatabase_name,
\t\traw_key,
\t\tstatic_cast<int>(sizeof(raw_key))
\t);
\tvolatile char* wipe = raw_key;
\tfor (size_t index = 0; index < sizeof(raw_key); ++index) wipe[index] = 0;
\treturn status;
}
}

NODE_METHOD(Database::JS_key) {
\tDatabase* database = Unwrap<Database>(info.This());
\tREQUIRE_DATABASE_OPEN(database);
\tREQUIRE_DATABASE_NOT_BUSY(database);
\tREQUIRE_DATABASE_NO_ITERATORS(database);
\tif (info.Length() <= first() || !node::Buffer::HasInstance(info[first()])) {
\t\treturn ThrowTypeError("Expected a 32-byte Buffer");
\t}
\tv8::Local<v8::Object> buffer = info[first()].As<v8::Object>();
\tconst size_t key_length = node::Buffer::Length(buffer);
\tif (key_length != 32) {
\t\treturn ThrowRangeError("Expected a 32-byte Buffer");
\t}
\tconst int status = ApplyRawKey(
\t\tdatabase->db_handle,
\t\t"main",
\t\tnode::Buffer::Data(buffer)
\t);
\tif (status != SQLITE_OK) return database->ThrowDatabaseError();
\tinfo.GetReturnValue().Set(info.This());
}

NODE_METHOD(Database::JS_keyAttachedExport) {
\tDatabase* database = Unwrap<Database>(info.This());
\tREQUIRE_DATABASE_OPEN(database);
\tREQUIRE_DATABASE_NOT_BUSY(database);
\tREQUIRE_DATABASE_NO_ITERATORS(database);
\tif (info.Length() <= first() || !node::Buffer::HasInstance(info[first()])) {
\t\treturn ThrowTypeError("Expected a 32-byte Buffer");
\t}
\tv8::Local<v8::Object> buffer = info[first()].As<v8::Object>();
\tconst size_t key_length = node::Buffer::Length(buffer);
\tif (key_length != 32) {
\t\treturn ThrowRangeError("Expected a 32-byte Buffer");
\t}
\tconst int status = ApplyRawKey(
\t\tdatabase->db_handle,
\t\t"encrypted_export",
\t\tnode::Buffer::Data(buffer)
\t);
\tif (status != SQLITE_OK) return database->ThrowDatabaseError();
\tinfo.GetReturnValue().Set(info.This());
}

NODE_GETTER(Database::JS_open) {
`,
);

replaceExact(
  "lib/database.js",
  "Database.prototype.unsafeMode = wrappers.unsafeMode;\n",
  `Database.prototype.unsafeMode = wrappers.unsafeMode;
Database.prototype.key = function key(buffer, databaseName = 'main') {
\tif (!Buffer.isBuffer(buffer)) throw new TypeError('Expected a 32-byte Buffer');
\tif (buffer.length !== 32) throw new RangeError('Expected a 32-byte Buffer');
\tif (databaseName === 'main') this[util.cppdb].key(buffer);
\telse if (databaseName === 'encrypted_export') this[util.cppdb].keyAttachedExport(buffer);
\telse throw new RangeError('Unsupported database name');
\treturn this;
};
`,
);
