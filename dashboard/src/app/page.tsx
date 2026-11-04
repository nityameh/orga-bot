import { redirect } from 'next/navigation';

// The dashboard layout checks the session and sends unauthenticated users to /login.
export default function Home() {
  redirect('/dashboard');
}
