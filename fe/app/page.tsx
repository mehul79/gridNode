"use client";

import { authClient } from "@/lib/auth-client";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from 'next/navigation'

export default function Dashboard() {
  const [disabled, setDisabled] = useState(false)
  const { data: session } = authClient.useSession();
  const router = useRouter()
  
  
  const clickFn = () => {
    setDisabled(true)
    authClient.signOut()
  }
  
  if (!session) return (<div className="h-screen gap-3 flex justify-center items-center">
    not logged in
    <button className="border-2 px-3 py-1 in-active:border-red-700 transition ease-in-out delay-100 cursor-pointer" onClick={() => router.push('/login')} >Login</button>
  </div>)
  
  console.log(session.user)
  
  return (<div className="h-screen flex justify-center items-center gap-3">

    <Image
      src={session.user.image}
      alt="User avatar"
      width={80}
      height={80}
      className="rounded-full"
    />
    Hello {session.user.name}
    
    
    <button disabled={disabled} onClick={clickFn} className="border-2 px-4 py-1 in-active:border-red-400 cursor-pointer disabled:border-grey-400 disabled:cursor-not-allowed transition ease-in-out">Logout</button>
  </div>);
}
