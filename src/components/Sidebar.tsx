import React from "react";
import {
  Compass,
  Search,
  Library,
  Heart,
  Settings,
  ChevronLeft,
  ChevronRight,
  Disc3,
} from "lucide-react";

export type NavTab = "home" | "search" | "library" | "liked" | "settings";

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
}) => {
  const navItems = [
    { id: "home" as NavTab, label: "Home", icon: Compass },
    { id: "search" as NavTab, label: "Search", icon: Search },
    { id: "library" as NavTab, label: "Library", icon: Library },
    { id: "liked" as NavTab, label: "Liked Songs", icon: Heart },
    { id: "settings" as NavTab, label: "Settings", icon: Settings },
  ];

  return (
    <aside
      className={`h-full bg-[#0d0d10] border-r border-[#1c1c20] flex flex-col justify-between py-4 select-none transition-all duration-200 shrink-0 ${
        isCollapsed ? "w-14 items-center px-1" : "w-48 px-3"
      }`}
    >
      <div className="flex flex-col space-y-6 w-full">
        {/* Toggle Collapse Button */}
        <div
          className={`flex items-center ${
            isCollapsed ? "justify-center" : "justify-between px-1"
          }`}
        >
          {!isCollapsed && (
            <div className="flex items-center space-x-2 text-zinc-400 text-xs font-semibold uppercase tracking-wider">
              <Disc3 className="w-4 h-4 text-red-500 animate-spin-slow" />
              <span>Menu</span>
            </div>
          )}
          <button
            onClick={onToggleCollapse}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Navigation List */}
        <nav className="flex flex-col space-y-1.5 w-full">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={`flex items-center rounded-lg transition-all text-xs font-medium ${
                  isCollapsed
                    ? "justify-center w-10 h-10 mx-auto"
                    : "w-full px-3 py-2.5 space-x-3"
                } ${
                  isActive
                    ? "bg-zinc-800/80 text-white shadow-sm font-semibold border-l-2 border-red-500"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30"
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? "text-red-400" : "text-zinc-400"
                  }`}
                />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer / Mini Brand info */}
      {!isCollapsed && (
        <div className="px-3 py-2 text-[10px] text-zinc-600 border-t border-zinc-800/50">
          <p className="truncate">Tauri v2 • Native Engine</p>
          <p className="text-zinc-700">Windows SMTC Enabled</p>
        </div>
      )}
    </aside>
  );
};
