"use client";
import { api } from "./api";

export default function LogoutButton() {
  return (
    <button className="btn quiet small" onClick={async () => { await api("/api/auth/logout", { body: {} }); window.location.href = "/"; }}>
      Log out
    </button>
  );
}
