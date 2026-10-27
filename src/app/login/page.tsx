import type { Metadata } from "next";
import { defaultCourseBrand } from "@/lib/course-brand";
import StaffSignIn from "./StaffSignIn";

export const metadata: Metadata = { title: "Staff sign in" };

export default function LoginPage() {
  return <StaffSignIn brand={defaultCourseBrand()} />;
}
