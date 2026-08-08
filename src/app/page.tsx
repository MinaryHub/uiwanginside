import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

export default function Home() {
  return <Dashboard appKey={process.env.NEXT_PUBLIC_KAKAO_JS_KEY} />;
}
