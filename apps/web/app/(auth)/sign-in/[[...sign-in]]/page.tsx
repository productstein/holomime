import { SignIn } from "@clerk/nextjs";
import { dark } from "@clerk/themes";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#09090b]">
      <SignIn afterSignInUrl="/dashboard" appearance={{ baseTheme: dark }} />
    </div>
  );
}
