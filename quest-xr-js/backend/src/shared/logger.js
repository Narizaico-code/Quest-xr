export function logInfo(message) {
  console.log(message);
}

export function logWarn(message) {
  console.warn(message);
}

export function logError(message, error) {
  if (error) {
    console.error(message, error);
    return;
  }

  console.error(message);
}
