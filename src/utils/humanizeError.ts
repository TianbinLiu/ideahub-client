export function humanizeError(err: any) {
  if (!err) return "Unknown error";

  switch (err.code) {
    case "UNAUTHORIZED":
      return "Please login first.";
    case "FORBIDDEN":
      return "You don't have permission to do that.";
    case "VALIDATION_ERROR":
      return "Please check your input.";
    case "NOT_FOUND":
      return "Not found.";
    case "DUPLICATE":
      return "Already exists.";
    default:
      return err.message || "Server error.";
  }
}
