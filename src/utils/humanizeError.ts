import i18n from '../i18n';

export function humanizeError(err: any) {
  if (!err) return i18n.t('errors.unknown');

  if (err?.message === 'You can only block this user after they have replied to you at least once.') {
    return i18n.t('messages.blockRequiresReplyBack');
  }

  if (typeof err?.message === 'string' && err.message.startsWith('Blocked users cannot')) {
    return i18n.t('messages.blockedInteraction');
  }

  switch (err.code) {
    case "UNAUTHORIZED":
      return i18n.t('auth.unauthorized');
    case "FORBIDDEN":
      return i18n.t('auth.forbidden');
    case "OTP_RESEND_COOLDOWN":
      // backend includes details.retryAfter (seconds)
      if (err?.details?.retryAfter) {
        return `请稍等 ${Number(err.details.retryAfter)} 秒后再请求验证码`;
      }
      if (err.message) return String(err.message);
      return "请稍后再试";
    case "VALIDATION_ERROR":
      return i18n.t('errors.validation');
    case "PUBLIC_LIMIT_EXCEEDED":
      if (err?.details?.limit) return `Free accounts can publish up to ${Number(err.details.limit)} public ideas. Delete one or upgrade your account.`;
      return i18n.t('errors.publicLimitExceeded');
    case "FEEDBACK_VALIDATION_FAILED":
      return err.message || i18n.t('errors.feedbackValidationFailed');
    case "NOT_FOUND":
      return i18n.t('errors.notFound');
    case "DUPLICATE":
      return i18n.t('errors.duplicate');
    case "OAUTH_NOT_LINKED":
      return i18n.t('auth.oauthNotLinkedError');
    case "OAUTH_UNLINK_LAST_METHOD":
      return i18n.t('auth.oauthUnlinkLastMethod');
    case "PASSWORD_ALREADY_SET":
      return i18n.t('auth.passwordAlreadySet');
    case "PASSWORD_NOT_SET":
      return i18n.t('auth.passwordNotSet');
    case "INVALID_CURRENT_PASSWORD":
      return i18n.t('auth.invalidCurrentPassword');
    default:
      return err.message || i18n.t('errors.serverError');
  }
}
