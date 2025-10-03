import { useState } from "react";
import { Outlet, useNavigate, Link, useLocation } from "react-router-dom";
import { ChevronRight, Home, FileText, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DUMMY_ATTENDEE } from "@/data/dummyData";

const DeviceLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isNavOpen, setIsNavOpen] = useState(false);

  const handleLogout = () => {
    console.log("🚪 Device Logout", {
      attendee: DUMMY_ATTENDEE.name,
      timestamp: new Date().toISOString(),
    });
    navigate("/");
  };

  const navItems = [
    { label: "Home", path: "", icon: Home },
    { label: "Logs", path: "/logs", icon: FileText },
  ];

  const getDeviceId = () => {
    const match = location.pathname.match(/\/device\/([^\/]+)/);
    return match ? match[1] : "";
  };

  const isActive = (path: string) => {
    const deviceId = getDeviceId();
    const fullPath = `/device/${deviceId}${path}`;
    return location.pathname === fullPath;
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-primary/5 via-background to-secondary/10">
      {/* Top App Bar */}
      <header className="bg-background/80 backdrop-blur-md border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-medium">
              Welcome, {DUMMY_ATTENDEE.name}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Profile Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                  <Avatar>
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {DUMMY_ATTENDEE.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 glass">
                <div className="flex flex-col space-y-1 p-2">
                  <p className="text-sm font-medium">{DUMMY_ATTENDEE.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {DUMMY_ATTENDEE.email}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Last login:{" "}
                    {new Date(DUMMY_ATTENDEE.lastLogin).toLocaleString()}
                  </p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate(`/device/${getDeviceId()}/profile`)}>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside
          className={`${
            isNavOpen ? "w-64" : "w-16"
          } bg-background/80 backdrop-blur-md border-r transition-all duration-300 flex flex-col`}
        >
          <div className="p-4 flex justify-end">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsNavOpen(!isNavOpen)}
            >
              <ChevronRight
                className={`h-5 w-5 transition-transform ${
                  isNavOpen ? "rotate-180" : ""
                }`}
              />
            </Button>
          </div>

          <nav className="flex-1 px-2 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const deviceId = getDeviceId();
              const active = isActive(item.path);
              return (
                <Link
                  key={item.label}
                  to={`/device/${deviceId}${item.path}`}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {isNavOpen && <span>{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="container mx-auto p-6 max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default DeviceLayout;
