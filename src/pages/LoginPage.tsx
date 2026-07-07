import { useLocation, useNavigate } from "react-router-dom";
import AuthDialog from "../components/AuthDialog";
import { safeNext } from "../utils/safeNext";

export default function LoginPage() {
  const loc = useLocation();
  const nav = useNavigate();
  const next = safeNext(new URLSearchParams(loc.search).get("next") || "/");

  return <AuthDialog initialMode="login" next={next} onClose={() => nav("/", { replace: true })} />;
}
