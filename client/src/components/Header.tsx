import { Link, NavLink } from 'react-router';
import { useTheme } from '../hooks/useTheme';
import { BellIcon, LogoIcon, MoonIcon, SunIcon } from './icons';

export function Header() {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="star-band h-6" aria-hidden="true" />
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link
          to="/"
          className="flex items-center gap-2.5 rounded-lg font-display text-[1.05rem] font-semibold focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
        >
          <LogoIcon className="text-[1.7rem]" />
          <span>Shariah Stock Watch</span>
        </Link>
        <div className="flex items-center gap-1">
          <NavLink
            to="/alerts"
            className={({ isActive }) =>
              `inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none dark:hover:bg-slate-800 ${
                isActive
                  ? 'text-brand-700 dark:text-brand-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`
            }
          >
            <BellIcon className="text-lg" />
            <span className="sr-only sm:not-sr-only">แจ้งเตือน</span>
          </NavLink>
          <button
            type="button"
            onClick={toggle}
            className="rounded-lg p-2 text-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            aria-label={next === 'dark' ? 'เปลี่ยนเป็นโหมดมืด' : 'เปลี่ยนเป็นโหมดสว่าง'}
            title={next === 'dark' ? 'โหมดมืด' : 'โหมดสว่าง'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>
    </header>
  );
}
