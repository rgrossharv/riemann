export function leanPath(path) {
  return path.replace(/\.txt$/i, '.lean');
}

export function archivePath(path) {
  return path.replace(/\.lean$/i, '.txt');
}
