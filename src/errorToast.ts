export function humanizeError(err: any) {
  if (!err) return "Unknown error";

  switch (err.code) {
    case "UNAUTHORIZED": return "Please login first.";
    case "FORBIDDEN": return "You don't have permission to do that.";
    case "OTP_RESEND_COOLDOWN":
      if (err?.details?.retryAfter) return `请稍等 ${Number(err.details.retryAfter)} 秒后再请求验证码`;
      if (err.message) return String(err.message);
      return "请稍后再试";
    case "VALIDATION_ERROR":
      return "Please check your input.";
    case "NOT_FOUND": return "Not found.";
    case "DUPLICATE": return "Already exists.";
    default: return err.message || "Server error.";
  }
}
