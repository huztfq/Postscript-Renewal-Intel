// app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Link from 'next/link'
import { BarChart3, Users, Zap } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Renewal Intelligence — Postscript',
  description: 'Stakeholder change signals for CSM renewal prep',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex min-h-screen bg-gray-50">
          <aside className="w-56 bg-gray-900 text-gray-100 flex flex-col py-6 px-4 shrink-0">
            <div className="mb-8">
              <span className="text-xs font-semibold tracking-widest text-purple-400 uppercase">Postscript</span>
              <h1 className="text-base font-semibold text-white mt-1">Renewal Intel</h1>
            </div>
            <nav className="space-y-1">
              <Link href="/" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
                <BarChart3 size={15} />
                Accounts
              </Link>
              <Link href="/signals" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
                <Zap size={15} />
                Signals
              </Link>
              <Link href="/contacts" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
                <Users size={15} />
                Contacts
              </Link>
            </nav>
          </aside>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  )
}
