import { SignUp } from "@clerk/nextjs";
import { dark } from "@clerk/themes";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#09090b]">
      <SignUp afterSignUpUrl="/dashboard" appearance={{ baseTheme: dark }} />
    </div>
  );
}
