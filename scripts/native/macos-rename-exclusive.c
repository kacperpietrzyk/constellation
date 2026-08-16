#define _DARWIN_C_SOURCE

#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

static int same_symlink_identity(const struct stat *actual,
                                 const struct stat *expected) {
  return S_ISLNK(actual->st_mode) && actual->st_dev == expected->st_dev &&
         actual->st_ino == expected->st_ino &&
         actual->st_birthtimespec.tv_sec == expected->st_birthtimespec.tv_sec &&
         actual->st_birthtimespec.tv_nsec == expected->st_birthtimespec.tv_nsec;
}

static int path_has_identity_at(int directory_fd, const char *path,
                                const struct stat *expected) {
  struct stat actual;
  return fstatat(directory_fd, path, &actual, AT_SYMLINK_NOFOLLOW) == 0 &&
         same_symlink_identity(&actual, expected);
}

static int path_has_target_at(int directory_fd, const char *path,
                              const char *expected) {
  size_t expected_length = strlen(expected);
  char *actual = malloc(expected_length + 1);
  if (actual == NULL) {
    return 0;
  }
  ssize_t actual_length =
      readlinkat(directory_fd, path, actual, expected_length + 1);
  int matches = actual_length == (ssize_t)expected_length &&
                memcmp(actual, expected, expected_length) == 0;
  free(actual);
  return matches;
}

int main(int argc, char *argv[]) {
  if (argc != 3) {
    return 64;
  }

  const char *target = argv[1];
  const char *destination = argv[2];
  const char *separator = strrchr(destination, '/');
  size_t parent_length =
      separator == NULL ? 0 : (size_t)(separator - destination + 1);
  const char template_suffix[] = ".constellation-mcp-XXXXXX";
  size_t template_length = parent_length + sizeof(template_suffix);
  char *temporary_directory = malloc(template_length);
  if (temporary_directory == NULL) {
    return 74;
  }
  if (parent_length > 0) {
    memcpy(temporary_directory, destination, parent_length);
  }
  memcpy(temporary_directory + parent_length, template_suffix,
         sizeof(template_suffix));
  if (mkdtemp(temporary_directory) == NULL) {
    free(temporary_directory);
    return 74;
  }

  const char temporary_name[] = "alias";
  int directory_fd = -1;
  int symlink_fd = -1;
  int identity_captured = 0;
  struct stat identity;
  int result = 74;

  directory_fd = open(temporary_directory, O_RDONLY | O_DIRECTORY | O_CLOEXEC);
  if (directory_fd < 0 ||
      symlinkat(target, directory_fd, temporary_name) != 0) {
    goto cleanup;
  }
  symlink_fd =
      openat(directory_fd, temporary_name, O_RDONLY | O_SYMLINK | O_CLOEXEC);
  if (symlink_fd < 0 || fstat(symlink_fd, &identity) != 0 ||
      !S_ISLNK(identity.st_mode)) {
    goto cleanup;
  }
  identity_captured = 1;
  if (!path_has_identity_at(directory_fd, temporary_name, &identity) ||
      !path_has_target_at(directory_fd, temporary_name, target) ||
      fchflags(symlink_fd, identity.st_flags | UF_HIDDEN) != 0) {
    goto cleanup;
  }

  struct stat hidden_identity;
  if (fstat(symlink_fd, &hidden_identity) != 0 ||
      !same_symlink_identity(&hidden_identity, &identity) ||
      !path_has_identity_at(directory_fd, temporary_name, &identity) ||
      !path_has_target_at(directory_fd, temporary_name, target)) {
    goto cleanup;
  }
  if (renameatx_np(directory_fd, temporary_name, AT_FDCWD, destination,
                   RENAME_EXCL) != 0) {
    result = errno == EEXIST ? 17 : 74;
    goto cleanup;
  }
  if (!path_has_identity_at(AT_FDCWD, destination, &identity) ||
      !path_has_target_at(AT_FDCWD, destination, target)) {
    goto cleanup;
  }
  result = 0;

cleanup:
  if (symlink_fd >= 0) {
    (void)close(symlink_fd);
  }
  if (directory_fd >= 0) {
    if (identity_captured &&
        path_has_identity_at(directory_fd, temporary_name, &identity)) {
      (void)unlinkat(directory_fd, temporary_name, 0);
    }
    (void)close(directory_fd);
  }
  (void)rmdir(temporary_directory);
  free(temporary_directory);
  return result;
}
