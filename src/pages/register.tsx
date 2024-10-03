import Link from "next/link";
import { Icon } from "@iconify/react";
import Layout from "@/layouts/Minimal";
import Button from "@/components/elements/base/button/Button";
import Input from "@/components/elements/form/input/Input";
import LogoText from "@/components/vector/LogoText";
import ThemeSwitcher from "@/components/widgets/ThemeSwitcher";
import { useRouter } from "next/router";
import React, { useState, useEffect } from "react";
import $fetch from "@/utils/api";
import { useDashboardStore } from "@/stores/dashboard";
import { useTranslation } from "next-i18next";
import { useGoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import Heading from "@/components/elements/base/heading/Heading";
import Paragraph from "@/components/elements/base/paragraph/Paragraph";
import ButtonLink from "@/components/elements/base/button-link/ButtonLink";
import Alert from "@/components/elements/base/alert/Alert";

const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID as string;

function validatePassword(password: string): { [key: string]: boolean } {
  return {
    "Has at least 8 characters": password.length >= 8,
    "Has uppercase letters": /[A-Z]/.test(password),
    "Has lowercase letters": /[a-z]/.test(password),
    "Has numbers": /\d/.test(password),
    "Has non-alphanumeric characters": /\W/.test(password),
  };
}

function PasswordValidation({ password }: { password: string }) {
  const conditions = validatePassword(password);
  const isValid = Object.values(conditions).every(Boolean);

  return (
    <Alert
      color={isValid ? "success" : "danger"}
      className="text-sm"
      canClose={false}
    >
      <div className="flex flex-col gap-1">
        {Object.entries(conditions).map(([condition, valid], index) => (
          <div
            key={index}
            className={`flex gap-2 items-center ${
              valid ? "text-green-500" : "text-red-500"
            }`}
          >
            <Icon icon={valid ? "mdi:check-bold" : "mdi:close-thick"} />
            {condition}
          </div>
        ))}
      </div>
    </Alert>
  );
}

function RegisterComponent() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referral, setReferral] = useState("");
  const [isVerificationStep, setIsVerificationStep] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [isPasswordValid, setIsPasswordValid] = useState(false); // State to track password validity
  const [showPassword, setShowPassword] = useState(false); // State to toggle password visibility
  const { setIsFetched } = useDashboardStore();
  const router = useRouter();
  const { ref, token } = router.query as { ref: string; token: string };

  useEffect(() => {
    if (router.query.ref) {
      setReferral(ref);
    }
    if (router.query.token) {
      setVerificationCode(token);
      handleVerificationSubmit(token);
    }
  }, [router.query]);

  useEffect(() => {
    // Check password validity whenever it changes
    setIsPasswordValid(
      Object.values(validatePassword(password)).every(Boolean)
    );
  }, [password]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await $fetch({
      url: "/api/auth/register",
      method: "POST",
      body: { firstName, lastName, email, password, ref: referral },
    });
    setLoading(false);
    if (data && !error) {
      if (process.env.NEXT_PUBLIC_VERIFY_EMAIL_STATUS === "true") {
        setIsVerificationStep(true);
      } else {
        setIsFetched(false);
        router.push("/user");
      }
    }
  };

  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      const { access_token } = tokenResponse;
      const { data, error } = await $fetch({
        url: "/api/auth/register/google",
        method: "POST",
        body: { token: access_token, ref: referral },
      });
      if (data && !error) {
        setIsFetched(false);
        router.push("/user");
      }
    },
    onError: (errorResponse) => {
      console.error("Google login failed", errorResponse);
    },
  });

  const handleVerificationSubmit = async (verificationToken?: string) => {
    setLoading(true);
    const tokenToVerify = verificationToken || verificationCode;
    const { data, error } = await $fetch({
      url: "/api/auth/verify/email",
      method: "POST",
      body: { token: tokenToVerify },
    });
    setLoading(false);
    if (data && !error) {
      setIsFetched(false);
      router.push("/user");
    }
  };

  return (
    <Layout title={t("Register")} color="muted">
      <main className="relative min-h-screen">
        <div className="flex h-screen flex-col items-center bg-white dark:bg-muted-900 md:flex-row">
          <div className="hidden h-screen w-full bg-indigo-600 md:w-1/2 lg:flex xl:w-2/3 from-primary-900 to-primary-500 i group relative items-center justify-around overflow-hidden bg-gradient-to-tr md:flex">
            <div className="mx-auto max-w-xs text-center">
              <Heading as="h2" weight="medium" className="text-white">
                {t("Have an Account")}?
              </Heading>
              <Paragraph size="sm" className="text-muted-200 mb-3">
                {t(
                  "No need to waste time on this page, let's take you back to your account"
                )}
              </Paragraph>
              <ButtonLink href="/login" shape="curved" className="w-full">
                {t("Login to Account")}
              </ButtonLink>
            </div>
            <div className="bg-muted-200/20 absolute -start-6 -top-6 h-14 w-0 origin-top-left rotate-45 rounded-full transition-all delay-[25ms] duration-300 group-hover:w-72"></div>
            <div className="bg-muted-200/20 absolute -top-12 start-20 h-14 w-0 origin-top-left rotate-45 rounded-full transition-all delay-75 duration-300 group-hover:w-48"></div>
            <div className="bg-muted-200/20 absolute -start-7 top-24 h-14 w-0 origin-top-left rotate-45 rounded-full transition-all delay-150 duration-300 group-hover:w-40"></div>

            <div className="bg-muted-200/20 absolute -bottom-6 -end-6 h-14 w-0 origin-bottom-right rotate-45 rounded-full transition-all delay-150 duration-300 group-hover:w-72"></div>
            <div className="bg-muted-200/20 absolute -bottom-12 end-20 h-14 w-0 origin-bottom-right rotate-45 rounded-full transition-all delay-75 duration-300 group-hover:w-48"></div>
            <div className="bg-muted-200/20 absolute -end-7 bottom-24 h-14 w-0 origin-bottom-right rotate-45 rounded-full transition-all delay-[25ms] duration-300 group-hover:w-40"></div>
          </div>

          <div className="relative flex h-screen w-full items-center justify-center bg-white px-6 dark:bg-muted-900 md:mx-auto md:w-1/2 md:max-w-md lg:max-w-full lg:px-16 xl:w-1/3 xl:px-12">
            <div className="absolute inset-x-0 top-6 mx-auto w-full max-w-sm px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Link href="/">
                    <LogoText className="h-6 text-primary-500" />
                  </Link>
                </div>
                <div className="flex items-center justify-end">
                  <ThemeSwitcher />
                </div>
              </div>
            </div>
            <div className="mx-auto w-full max-w-sm px-4">
              <h1 className="mt-12 mb-6 font-sans text-2xl font-light leading-9 text-muted-800 dark:text-muted-100">
                {isVerificationStep
                  ? t("Verify your email")
                  : t("Create a new account")}
              </h1>

              {isVerificationStep ? (
                <form
                  className="mt-6"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleVerificationSubmit();
                  }}
                  method="POST"
                >
                  <div className="flex flex-col gap-4">
                    <Input
                      icon="lucide:lock"
                      label={t("Verification Code")}
                      color="contrast"
                      placeholder={t("Enter verification code")}
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                    />
                  </div>

                  <div className="mt-6">
                    <Button
                      type="submit"
                      color="primary"
                      size="md"
                      className="w-full"
                      loading={loading}
                      disabled={loading}
                    >
                      {t("Verify Email")}
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  {googleClientId && (
                    <>
                      <div>
                        <Button
                          type="button"
                          size="md"
                          className="w-full"
                          onClick={() => handleGoogleLogin()}
                          loading={loading}
                          disabled={loading}
                        >
                          <Icon
                            icon="logos:google-icon"
                            className="me-1 h-4 w-4"
                          />
                          <span>{t("Sign up with Google")}</span>
                        </Button>
                      </div>

                      <div className="relative">
                        <hr className="my-8 w-full border-muted-300 dark:border-muted-800" />
                        <div className="absolute inset-x-0 -top-3 mx-auto text-center">
                          <span className="bg-white px-4 py-1 font-sans text-sm text-muted-400 dark:bg-muted-900">
                            {t("or signup with email")}
                          </span>
                        </div>
                      </div>
                    </>
                  )}

                  <form className="mt-6" onSubmit={handleSubmit} method="POST">
                    <div className="flex flex-col gap-4">
                      <div className="flex gap-4">
                        <Input
                          autoComplete="given-name"
                          label={t("First Name")}
                          color="contrast"
                          placeholder={t("John")}
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                        />
                        <Input
                          autoComplete="family-name"
                          label={t("Last Name")}
                          color="contrast"
                          placeholder={t("Doe")}
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                        />
                      </div>
                      <Input
                        type="email"
                        icon="lucide:mail"
                        label={t("Email address")}
                        color="contrast"
                        placeholder={t("ex: johndoe@gmail.com")}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"} // Conditionally change the input type
                          icon="lucide:lock"
                          label={t("Password")}
                          color="contrast"
                          placeholder=""
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                        <button
                          type="button"
                          className="absolute right-4 top-[34px] font-sans" // Adjust the position as needed
                          onClick={() => setShowPassword(!showPassword)} // Toggle password visibility
                        >
                          <Icon
                            icon={
                              showPassword ? "lucide:eye" : "lucide:eye-off"
                            }
                            className="w-4 h-4 text-muted-400 hover:text-primary-500 dark:text-muted-500 dark:hover:text-primary-500"
                          />
                        </button>
                      </div>
                      <PasswordValidation password={password} />
                      {referral && (
                        <Input
                          label={t("Referral Code")}
                          color="contrast"
                          placeholder={t("Referral code")}
                          value={referral}
                          onChange={(e) => setReferral(e.target.value)}
                          readOnly
                        />
                      )}
                    </div>

                    <div className="mt-6">
                      <Button
                        type="submit"
                        color="primary"
                        size="md"
                        className="w-full"
                        loading={loading}
                        disabled={loading || !isPasswordValid} // Disable if loading or password is invalid
                      >
                        {t("Sign up")}
                      </Button>
                    </div>
                  </form>

                  <hr className="my-8 w-full border-muted-300 dark:border-muted-800" />

                  <p className="mt-8 space-x-2 font-sans text-sm leading-5 text-muted-600 dark:text-muted-400">
                    <span>{t("Already have an account?")}</span>
                    <Link
                      href="/login"
                      className="font-medium text-primary-600 underline-offset-4 transition duration-150 ease-in-out hover:text-primary-500 hover:underline focus:underline focus:outline-none"
                    >
                      {t("Log in")}
                    </Link>
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
}

export default function Register() {
  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <RegisterComponent />
    </GoogleOAuthProvider>
  );
}
