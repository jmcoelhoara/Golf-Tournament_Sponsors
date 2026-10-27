import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { COURSE_BRANDS, findCourseBrand } from "@/lib/course-brand";
import StaffSignIn from "../StaffSignIn";

type Params = { params: Promise<{ course: string }> };

export function generateStaticParams() {
  return Object.keys(COURSE_BRANDS).map((course) => ({ course }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const brand = findCourseBrand((await params).course);
  return { title: brand ? `Staff sign in · ${brand.shortName}` : "Staff sign in" };
}

export default async function CourseLoginPage({ params }: Params) {
  const brand = findCourseBrand((await params).course);
  if (!brand) notFound();
  return <StaffSignIn brand={brand} />;
}
