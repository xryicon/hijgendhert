"use client";
import { useEffect } from 'react';
import { useMemberSession } from './session-provider';

export default function LoginSessionRedirect() {
  const { status } = useMemberSession();
  useEffect(() => { if (status === 'authenticated') window.location.replace('/profiel'); }, [status]);
  return null;
}
