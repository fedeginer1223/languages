import { type ReactNode, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Languages,
  BookOpen,
  GraduationCap,
  FileText,
  Menu,
  X,
  Pencil,
  ChevronDown,
  ChevronRight,
  Sparkles,
  LogOut,
  BookMarked,
} from 'lucide-react';
import { languagesApi } from '../services/api';
import { useAuth } from '../auth/AuthProvider';
import type { Language } from '../types';

interface LayoutProps {
  children: ReactNode;
}

function DueBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto min-w-[20px] h-[20px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
      {count > 99 ? '99+' : count}
    </span>
  );
}

function LanguageNode({
  lang, isExpanded, isCurrent, onToggle, onNavigate, isActive, pathname,
}: {
  lang: Language;
  isExpanded: boolean;
  isCurrent: boolean;
  onToggle: () => void;
  onNavigate: (href: string) => void;
  isActive: (href: string) => boolean;
  pathname: string;
}) {
  const { data: due } = useQuery({
    queryKey: ['due-counts', lang.id],
    queryFn: () => languagesApi.getDueCounts(lang.id),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const sections = [
    { key: 'vocabulary' as const, name: 'Vocabulario', icon: BookOpen, href: `/languages/${lang.id}` },
    { key: 'books' as const, name: 'Libros', icon: BookMarked, href: `/languages/${lang.id}/books` },
    { key: 'verbs' as const, name: 'Verbos', icon: Pencil, href: `/languages/${lang.id}/verbs` },
    { key: 'essays' as const, name: 'Redacciones', icon: FileText, href: `/languages/${lang.id}/essays` },
    { key: 'structures' as const, name: 'Estructuras', icon: Sparkles, href: `/languages/${lang.id}/structures` },
  ];

  const sectionCount = (key: 'vocabulary' | 'verbs' | 'essays' | 'structures' | 'books') => {
    if (!due) return 0;
    if (key === 'essays' || key === 'books') return 0;
    return due[key];
  };
  const totalDue = due ? due.vocabulary + due.verbs + due.structures : 0;

  return (
    <div>
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-sm ${
          isCurrent
            ? 'text-sidebar-accent-foreground font-semibold'
            : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
        }`}
      >
        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <span className="font-medium">{lang.name}</span>
        {!isExpanded && <DueBadge count={totalDue} />}
      </button>

      {isExpanded && (
        <div className="ml-2 space-y-0.5">
          {sections.map((section) => {
            const Icon = section.icon;
            const active = section.href === `/languages/${lang.id}`
              ? pathname === section.href
              : isActive(section.href);
            const count = sectionCount(section.key);
            return (
              <button
                key={section.name}
                onClick={() => onNavigate(section.href)}
                className={`w-full flex items-center gap-3 pl-10 pr-4 py-2 rounded-lg transition-all text-sm ${
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">{section.name}</span>
                <DueBadge count={count} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedLanguages, setExpandedLanguages] = useState<Set<string>>(new Set());

  const { data: languages } = useQuery({
    queryKey: ['languages'],
    queryFn: languagesApi.getAll,
  });

  // Auto-expand the current language
  const languageMatch = location.pathname.match(/\/languages\/([^/]+)/);
  const [, bumpActive] = useState(0);
  useEffect(() => {
    const h = () => bumpActive((n) => n + 1);
    window.addEventListener('active-language-changed', h);
    return () => window.removeEventListener('active-language-changed', h);
  }, []);
  let storedLanguageId: string | null = null;
  if (!languageMatch && location.pathname.startsWith('/books/')) {
    try { storedLanguageId = sessionStorage.getItem('activeLanguageId'); } catch { /* ignore */ }
  }
  const currentLanguageId = languageMatch ? languageMatch[1] : storedLanguageId;

  useEffect(() => {
    if (currentLanguageId) {
      setExpandedLanguages(prev => new Set(prev).add(currentLanguageId));
    }
  }, [currentLanguageId]);

  const toggleLanguage = (id: string) => {
    setExpandedLanguages(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const isActive = (href: string) => {
    return location.pathname === href || location.pathname.startsWith(href + '/');
  };

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    navigate('/login', { replace: true });
  };

  const navTo = (href: string) => {
    navigate(href);
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-background">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed top-0 left-0 z-50 h-screen w-64 bg-sidebar border-r border-sidebar-border transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between p-6 border-b border-sidebar-border">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navTo('/languages')}>
              <div className="bg-sidebar-accent p-2 rounded-lg">
                <GraduationCap className="w-6 h-6 text-sidebar-foreground" />
              </div>
              <h1 className="text-xl font-bold text-sidebar-foreground">LangLearn</h1>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-sidebar-foreground hover:bg-sidebar-accent p-2 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto no-scrollbar">
            {/* Languages header */}
            <button
              onClick={() => navTo('/languages')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-sm ${
                location.pathname === '/languages' || location.pathname === '/'
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
              }`}
            >
              <Languages className="w-4 h-4" />
              <span className="font-medium">Idiomas</span>
            </button>

            {/* Language dropdowns */}
            {languages?.map((lang) => (
              <LanguageNode
                key={lang.id}
                lang={lang}
                isExpanded={expandedLanguages.has(lang.id)}
                isCurrent={currentLanguageId === lang.id}
                onToggle={() => toggleLanguage(lang.id)}
                onNavigate={navTo}
                isActive={isActive}
                pathname={location.pathname}
              />
            ))}
          </nav>

          {/* Logout */}
          <div className="border-t border-sidebar-border px-3 py-3">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-sm text-sidebar-foreground hover:bg-sidebar-accent/50"
            >
              <LogOut className="w-4 h-4" />
              <span className="font-medium">Salir</span>
            </button>
            {user && (
              <p className="px-4 pt-1 text-xs text-muted-foreground truncate" title={user.email}>{user.email}</p>
            )}
          </div>
        </div>
      </aside>

      <div className="lg:ml-64">
        <header className="bg-background border-b border-border sticky top-0 z-30 lg:hidden">
          <div className="flex items-center px-6 py-4">
            <button onClick={() => setSidebarOpen(true)} className="text-foreground hover:bg-accent p-2 rounded-lg">
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </header>
        <main className="min-h-screen">{children}</main>
      </div>
    </div>
  );
}
