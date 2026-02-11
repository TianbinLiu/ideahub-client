import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../authContext";

function cls(isActive: boolean) {
  return isActive ? "text-white" : "text-gray-300 hover:text-white";
}

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <div className="border-b border-gray-800 bg-gray-950/80 backdrop-blur">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="font-bold text-xl text-white">IdeaHub</Link>

        <div className="flex items-center gap-4 text-sm">
          <NavLink to="/" className={({ isActive }) => cls(isActive)}>Home</NavLink>
          <NavLink to="/ideas/new" className={({ isActive }) => cls(isActive)}>New</NavLink>
          <NavLink to="/me" className={({ isActive }) => cls(isActive)}>Me</NavLink>

          {user?.role === "company" && (
            <NavLink to="/company">Company</NavLink>
          )}

          {!user ? (
            <>
              <NavLink to="/login" className={({ isActive }) => cls(isActive)}>Login</NavLink>
              <NavLink to="/register" className={({ isActive }) => cls(isActive)}>Register</NavLink>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-gray-300">{user.username}</span>
              <button
                onClick={logout}
                className="rounded-lg border border-gray-700 px-3 py-1.5 hover:bg-gray-900"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
