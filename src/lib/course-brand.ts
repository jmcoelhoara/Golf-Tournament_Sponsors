// Course branding for staff-facing screens (sign-in, admin header).
// Each golf course client gets one entry. Assets live in public/courses/<slug>/.
// Branding is presentation only: tees and yardages live in the database course catalog
// (see supabase/courses/<slug>.sql).

export type CourseImage = { src: string; width: number; height: number; alt: string };

export type CourseBrand = {
  slug: string;
  /** Club name as the club presents itself. */
  clubName: string;
  /** Short name for tight spaces. */
  shortName: string;
  /** The course this layout belongs to (a club can have several). */
  courseName: string;
  location: string;
  logo: CourseImage;
  map: CourseImage;
  facts: { label: string; value: string }[];
  /** Accent taken from the club's own logo, used sparingly on staff screens. */
  accent: string;
};

export const COURSE_BRANDS: Record<string, CourseBrand> = {
  "westwood-plateau": {
    slug: "westwood-plateau",
    clubName: "GreenTee Country Club Westwood Plateau",
    shortName: "Westwood Plateau",
    courseName: "Sky Course",
    location: "Coquitlam, BC",
    logo: {
      src: "/courses/westwood-plateau/logo.png",
      width: 300,
      height: 300,
      alt: "GreenTee Country Club Westwood Plateau logo",
    },
    map: {
      src: "/courses/westwood-plateau/course-map.webp",
      width: 1284,
      height: 1400,
      alt: "Map of the 18-hole Sky Course at Westwood Plateau, from the clubhouse out to hole 9 and back past the golf academy",
    },
    facts: [
      { label: "Holes", value: "18" },
      { label: "Par", value: "72" },
      { label: "Gold tees", value: "6,770 yds" },
    ],
    accent: "#a87c4f",
  },
};

export const DEFAULT_COURSE_SLUG = "westwood-plateau";

/** Returns the brand for a slug, or undefined when the slug is unknown. */
export function findCourseBrand(slug: string): CourseBrand | undefined {
  return Object.hasOwn(COURSE_BRANDS, slug) ? COURSE_BRANDS[slug] : undefined;
}

/**
 * Brand shown on the plain /login page. Set NEXT_PUBLIC_DEFAULT_COURSE to another slug
 * (or to "none" for an unbranded sign-in) when a deployment serves a different club.
 */
export function defaultCourseBrand(): CourseBrand | undefined {
  const slug = process.env.NEXT_PUBLIC_DEFAULT_COURSE?.trim() || DEFAULT_COURSE_SLUG;
  return slug === "none" ? undefined : findCourseBrand(slug);
}
