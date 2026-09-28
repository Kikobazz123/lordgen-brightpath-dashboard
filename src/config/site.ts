/**
 * Single source of truth for brand identity.
 *
 * Every component that renders the company name, tagline, contact address or
 * header navigation reads from here. Rebranding the whole dashboard is an edit
 * to this file, not a grep across the component tree.
 */

export const siteConfig = {
  name: "Brightpath Solutions",
  shortName: "Brightpath",
  tagline: "Software and Professional Services for Growing Businesses",

  /** Rendered under the brand name in the sidebar header. */
  sidebarSubtitle: "Admin Dashboard",

  /**
   * Who built this. Credited in both footers — the dashboard's and the
   * marketing site's — which is why it lives here rather than being typed
   * into each of them separately.
   */
  author: "Lordmark Dorgu",

  email: "zaxellimited360@gmail.com",

  /**
   * The signed-in account shown in the sidebar footer. Everyone enters through
   * the demo sign-in, so this is that account, not the builder's contact
   * address (which is `email` above). The sidebar is a client component and the
   * session cookie is httpOnly, so it mirrors demoSignIn.email rather than
   * reading the cookie; if DEMO_SIGNIN_EMAIL is overridden, update this too.
   */
  user: {
    name: "Demo account",
    email: "Judges@buildfest.com",
    avatar: "",
  },

  /**
   * The account the sign-in page arrives pre-filled with.
   *
   * Not a credential — nothing is checked. See `src/lib/auth/session.ts`: the
   * gate exists so a visitor meets the marketing site first and enters the app
   * deliberately, not to keep anyone out. Overridable with DEMO_SIGNIN_EMAIL.
   */
  demoSignIn: {
    email: "Judges@buildfest.com",
    password: "buildfest",
  },

  /** Ghost buttons on the right of the dashboard header. */
  headerLinks: [
    { label: "Home", href: "/landing", external: false },
    { label: "Pricing", href: "/pricing", external: false },
    { label: "Contact", href: "mailto:zaxellimited360@gmail.com", external: true },
  ],
} as const

export type SiteConfig = typeof siteConfig
