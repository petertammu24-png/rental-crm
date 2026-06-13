import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatApiErrorDetail } from "@/lib/api";

export default function Login() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email.trim().toLowerCase(), password);
      toast.success("Welcome back");
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#FDFBF7]">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 bg-[#0A3626] text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "url(https://images.unsplash.com/photo-1617633150878-7df1d12a9a57?crop=entropy&cs=srgb&fm=jpg&w=1200&q=70)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="relative z-10">
          <div className="label-eyebrow text-[#D4AF37]">Rental CRM</div>
          <h1 className="font-display text-5xl mt-2">Maharani Jewels</h1>
        </div>
        <div className="relative z-10 max-w-md">
          <div className="flex items-center gap-2 mb-4 text-[#D4AF37]">
            <Sparkles className="w-4 h-4" /> <span className="text-xs tracking-[0.2em] uppercase">Manage with grace</span>
          </div>
          <p className="font-display text-2xl leading-snug">
            Track every set, every bill, every return — all in one elegant ledger.
          </p>
        </div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8">
            <div className="label-eyebrow text-[#0A3626]">Rental CRM</div>
            <h1 className="font-display text-3xl mt-1">Maharani Jewels</h1>
          </div>

          <div className="bg-white border border-[#EAE5D9] rounded-xl p-8 shadow-sm">
            <h2 className="font-display text-2xl text-[#1C1C1C]">Welcome back</h2>
            <p className="text-sm text-[#737373] mt-1">Sign in to your CRM dashboard</p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4" data-testid="login-form">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs tracking-[0.15em] uppercase text-[#737373]">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@jewel.com"
                  className="border-[#EAE5D9] focus-visible:ring-[#0A3626]/20 focus-visible:border-[#0A3626]"
                  data-testid="login-email-input"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs tracking-[0.15em] uppercase text-[#737373]">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={show ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pr-10 border-[#EAE5D9] focus-visible:ring-[#0A3626]/20 focus-visible:border-[#0A3626]"
                    data-testid="login-password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#737373] hover:text-[#1C1C1C]"
                    data-testid="login-toggle-password"
                  >
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#0A3626] hover:bg-[#134D38] text-white"
                data-testid="login-submit-button"
              >
                {submitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <div className="mt-6 text-xs text-[#737373] border-t border-[#EAE5D9] pt-4">
              Default: <span className="text-[#1C1C1C] font-medium">admin@jewel.com</span> / <span className="text-[#1C1C1C] font-medium">admin123</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
