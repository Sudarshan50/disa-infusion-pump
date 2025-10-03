import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { DUMMY_ADMIN } from "@/data/dummyData";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("🔐 Admin Login Attempt", {
      email,
      timestamp: new Date().toISOString(),
      success: true,
    });
    navigate("/admin");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/10 p-4">
      <Card className="w-full max-w-md glass border-2">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary rounded-2xl flex items-center justify-center">
            <Activity className="w-10 h-10 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-3xl font-bold">MediFlow</CardTitle>
            <CardDescription className="text-base mt-2">
              Hospital Infusion Pump Management System
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="admin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="admin">Admin</TabsTrigger>
              <TabsTrigger value="device">Device/Attendee</TabsTrigger>
            </TabsList>
            
            <TabsContent value="admin" className="space-y-4">
              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@hospital.example"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-12"
                  />
                </div>
                <Button type="submit" className="w-full h-12 text-base">
                  Sign in as Admin
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="device" className="space-y-4">
              <Card className="bg-muted/50 border-dashed">
                <CardContent className="pt-6 text-center text-muted-foreground">
                  <p className="text-sm">Device/Attendee login will be implemented in a future update.</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
