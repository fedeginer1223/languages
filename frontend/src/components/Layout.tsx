import { ReactNode } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import {
  Languages,
  BookOpen,
  GraduationCap,
  FileText,
  BarChart3,
  Menu,
  X,
  Dumbbell,
  Pencil,
  Calendar,
} from 'lucide-react';
import { useState } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Extract languageId from URL if present
  const languageMatch = location.pathname.match(/\/languages\/([^/]+)/);
  const languageId = languageMatch ? languageMatch[1] : null;

  // Check if we're inside a language context
  const inLanguageContext = !!languageId && location.pathname !== '/languages';

  const mainNav = [
    { name: 'Idiomas', icon: Languages, href: '/languages' },
  ];

  const languageNav = languageId ? [
    { name: 'Resumen', icon: BookOpen, href: `/languages/${languageId}`, indent: false },
    { name: 'Vocabulario', icon: BookOpen, href: `/languages/${languageId}`, indent: true },
    { name: 'Verbos', icon: Pencil, href: `/languages/${languageId}/verbs`, indent: true },
    { name: 'Redacciones', icon: FileText, href: `/languages/${languageId}/essays`, indent: true },
    { name: 'Entrenamientos', icon: Dumbbell, href: `/languages/${languageId}/training-sessions`, indent: false },
    { name: 'Estadísticas', icon: BarChart3, href: `/languages/${languageId}/stats`, indent: false },
  ] : [];

  const isActive = (href: string) => {
    if (href === '/languages' && !inLanguageContext) return true;
    if (href === `/languages/${languageId}`) {
      // Only exact match for "Resumen", not sub-paths
      return location.pathname === href;
    }
    return location.pathname.startsWith(href);
  };

  const NavButton = ({ item }: { item: { name: string; icon: any; href: string; indent?: boolean } }) => {
    const Icon = item.icon;
    const active = isActive(item.href);
    return (
      <button
        onClick={() => {
          navigate(item.href);
          setSidebarOpen(false);
        }}
        className={`w-full flex items-center gap-3 py-2 rounded-lg transition-all text-sm ${
          item.indent ? 'pl-10 pr-4' : 'px-4'
        } ${
          active
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
        }`}
      >
        <Icon className={`${item.indent ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
        <span className={item.indent ? 'text-xs font-medium' : 'font-medium'}>{item.name}</span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-screen w-64 bg-sidebar border-r border-sidebar-border transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between p-6 border-b border-sidebar-border">
            <div
              className="flex items-center gap-3 cursor-pointer"
              onClick={() => { navigate('/languages'); setSidebarOpen(false); }}
            >
              <div className="bg-sidebar-accent p-2 rounded-lg">
                <GraduationCap className="w-6 h-6 text-sidebar-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-sidebar-foreground">LangLearn</h1>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-sidebar-foreground hover:bg-sidebar-accent p-2 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto no-scrollbar">
            {/* Main nav */}
            {mainNav.map((item) => (
              <NavButton key={item.name} item={item} />
            ))}

            {/* Language-specific nav */}
            {inLanguageContext && languageNav.length > 0 && (
              <>
                <div className="pt-4 pb-2 px-4">
                  <p className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
                    Idioma
                  </p>
                </div>
                {languageNav.map((item) => (
                  <NavButton key={item.name} item={item} />
                ))}
              </>
            )}
          </nav>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Top bar (mobile only burger) */}
        <header className="bg-background border-b border-border sticky top-0 z-30 lg:hidden">
          <div className="flex items-center px-6 py-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-foreground hover:bg-accent p-2 rounded-lg transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="min-h-screen">{children}</main>
      </div>
    </div>
  );
}
