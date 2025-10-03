import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, AlertCircle } from "lucide-react";
import { DUMMY_ADMIN, DUMMY_DEVICE_DIRECTORY } from "@/data/dummyData";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [devicePassword, setDevicePassword] = useState("");
  const [deviceError, setDeviceError] = useState("");

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("🔐 Admin Login Attempt", {
      email,
      timestamp: new Date().toISOString(),
      success: true,
    });
    navigate("/admin");
  };

  const handleDeviceLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setDeviceError("");

    const device = DUMMY_DEVICE_DIRECTORY.find(d => d.deviceId === deviceId.toUpperCase());
    
    if (!device) {
      setDeviceError("Device ID not found");
      console.log("🔐 Device Login Failed", {
        type: "device_login_failed",
        deviceId,
        reason: "invalid_device_id",
        at: new Date().toISOString(),
      });
      return;
    }

    if (device.password !== devicePassword) {
      setDeviceError("Invalid password");
      console.log("🔐 Device Login Failed", {
        type: "device_login_failed",
        deviceId,
        reason: "invalid_password",
        at: new Date().toISOString(),
      });
      return;
    }

    console.log("🔐 Device Login Success", {
      type: "device_login_success",
      deviceId: device.deviceId,
      attendeeName: "Nurse K. Mehta",
      at: new Date().toISOString(),
    });
    navigate(`/device/${device.deviceId}`);
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
              <form onSubmit={handleDeviceLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="deviceId">Device ID</Label>
                  <Input
                    id="deviceId"
                    type="text"
                    placeholder="PUMP_001"
                    value={deviceId}
                    onChange={(e) => {
                      setDeviceId(e.target.value);
                      setDeviceError("");
                    }}
                    required
                    className="h-12 uppercase"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="devicePassword">Password</Label>
                  <Input
                    id="devicePassword"
                    type="password"
                    placeholder="••••••••"
                    value={devicePassword}
                    onChange={(e) => {
                      setDevicePassword(e.target.value);
                      setDeviceError("");
                    }}
                    required
                    className="h-12"
                  />
                </div>
                {deviceError && (
                  <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-lg">
                    <AlertCircle className="h-4 w-4" />
                    <span>{deviceError}</span>
                  </div>
                )}
                <Button type="submit" className="w-full h-12 text-base">
                  Sign in to Device
                </Button>
              </form>
              <div className="bg-muted/50 p-4 rounded-lg text-sm text-muted-foreground text-center">
                <p className="font-medium mb-1">Demo Credentials:</p>
                <p>Device: PUMP_001, PUMP_002, PUMP_003, PUMP_004</p>
                <p>Password: 1234</p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
