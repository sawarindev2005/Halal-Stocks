import { Link } from 'react-router';

export function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="text-5xl font-semibold text-slate-300 dark:text-slate-700">404</p>
      <h1 className="mt-3 text-lg font-semibold">ไม่พบหน้าที่ต้องการ</h1>
      <Link
        to="/"
        className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline dark:text-brand-500"
      >
        กลับไปหน้า Watchlist
      </Link>
    </div>
  );
}
