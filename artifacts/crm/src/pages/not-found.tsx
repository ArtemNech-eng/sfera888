import { Link } from "wouter";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <div className="text-center bg-card p-8 md:p-12 rounded-3xl border border-border shadow-2xl shadow-black/5 max-w-md w-full">
        <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-4xl font-display font-bold text-foreground mb-3">404</h1>
        <p className="text-lg text-muted-foreground mb-8">Страница не найдена или у вас нет к ней доступа.</p>
        <Link 
          href="/" 
          className="inline-flex items-center justify-center px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 hover:-translate-y-0.5"
        >
          На главную
        </Link>
      </div>
    </div>
  );
}
