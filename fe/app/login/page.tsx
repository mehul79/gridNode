"use client";

import { authClient } from "@/lib/auth-client";

export default function GithubLogin() {

  const login = async () => {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "http://localhost:3000"
    });
  };

  return (
    <div className="h-screen flex justify-center items-center">
    <button onClick={login} className="bg-blue-500 text-white px-4 py-2 rounded cursor-pointer">
      Login with GitHub
      </button>
    </div>
  );
}