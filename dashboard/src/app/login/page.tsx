'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [phone, setPhone] = useState('91');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) {
      setError('Enter a valid phone number');
      return;
    }
    localStorage.setItem('orga_phone', cleaned);
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm p-8 bg-white rounded-xl shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Orga</h1>
        <p className="text-gray-500 text-sm mb-8">
          Enter your WhatsApp number to view your notes, tasks, and reminders.
        </p>

        <form onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Phone number
          </label>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-gray-400 text-sm">+</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setError(''); }}
              placeholder="919876543210"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              autoFocus
            />
          </div>

          {error && <p className="text-red-500 text-xs mb-4">{error}</p>}

          <button
            type="submit"
            className="w-full py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            Continue
          </button>
        </form>

        <p className="text-xs text-gray-400 mt-6 text-center">
          Use the same number you message Orga on WhatsApp.
        </p>
      </div>
    </div>
  );
}
