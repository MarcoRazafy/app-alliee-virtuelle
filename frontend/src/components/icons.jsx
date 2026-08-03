// Icônes inline (SVG, trait 2px, currentColor) — aucune dépendance ajoutée,
// même style que les icônes déjà utilisées dans ThemeToggle/AuthBanner.

function base(children, props) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" {...props}>
      {children}
    </svg>
  );
}

export const IconWorkspace = (props) =>
  base(
    <>
      <rect x="3" y="4" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M3 9h18" stroke="currentColor" strokeWidth="2" />
      <path d="M8 4v-1a1 1 0 011-1h6a1 1 0 011 1v1" stroke="currentColor" strokeWidth="2" />
    </>,
    props
  );

// Grille de panneaux — glyphe classique de tableau de bord.
export const IconDashboard = (props) =>
  base(
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" stroke="currentColor" strokeWidth="2" />
    </>,
    props
  );

export const IconCalendarCheck = (props) =>
  base(
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 15l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>,
    props
  );

export const IconChecklist = (props) =>
  base(
    <>
      <path d="M9 6h11M9 12h11M9 18h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>,
    props
  );

export const IconChat = (props) =>
  base(
    <path
      d="M4 5h16v11H8l-4 4V5z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />,
    props
  );

export const IconSend = (props) =>
  base(
    <>
      <path d="M4 12 20 4l-4 16-4.5-6L4 12Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="m11.5 14 4.5-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>,
    props
  );

export const IconBarChart = (props) =>
  base(
    <path
      d="M4 20V10M12 20V4M20 20v-7"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />,
    props
  );

export const IconFolder = (props) =>
  base(
    <path
      d="M3 6a1 1 0 011-1h5l2 2h9a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V6z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />,
    props
  );

export const IconUser = (props) =>
  base(
    <>
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="2" />
      <path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>,
    props
  );

export const IconLogout = (props) =>
  base(
    <>
      <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 8l-4 4 4 4M6 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>,
    props
  );

export const IconAlert = (props) =>
  base(
    <>
      <path d="M12 3l10 18H2L12 3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 10v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </>,
    props
  );

export const IconSearch = (props) =>
  base(
    <>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>,
    props
  );

export const IconChevronDown = (props) =>
  base(<path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />, props);

export const IconExternalLink = (props) =>
  base(
    <>
      <path d="M9 15L20 4M20 4h-6M20 4v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M18 13v6a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>,
    props
  );

export const IconPlay = (props) =>
  base(<path d="M7 4l14 8-14 8V4z" fill="currentColor" />, props);

export const IconStop = (props) =>
  base(<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />, props);

export const IconClock = (props) =>
  base(
    <>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>,
    props
  );

export const IconLightbulb = (props) =>
  base(
    <>
      <path
        d="M9 18h6M10 21h4M8 14a5.5 5.5 0 118 0c-.8.9-1.5 1.7-1.5 3h-5c0-1.3-.7-2.1-1.5-3z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>,
    props
  );

export const IconX = (props) =>
  base(<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />, props);

export const IconArrowRight = (props) =>
  base(<path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />, props);

export const IconTrendingUp = (props) =>
  base(
    <path
      d="M3 17l6-6 4 4 8-8M21 7v5h-5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />,
    props
  );

export const IconCheckCircle = (props) =>
  base(
    <>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M8 12.5l2.5 2.5L16 9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>,
    props
  );

export const IconBell = (props) =>
  base(
    <>
      <path
        d="M6 10a6 6 0 1112 0c0 3.5 1 5 2 6H4c1-1 2-2.5 2-6z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 19a2 2 0 004 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>,
    props
  );

// Mégaphone : icône des annonces (distincte de la cloche des notifications).
export const IconMegaphone = (props) =>
  base(
    <>
      <path d="m3 11 18-5v12L3 14v-3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path
        d="M11.6 16.8a3 3 0 1 1-5.8-1.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>,
    props
  );

// Trois points verticaux (menu d'actions « … »).
export const IconDots = (props) =>
  base(
    <>
      <circle cx="12" cy="5" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="19" r="1.6" fill="currentColor" />
    </>,
    props
  );

export const IconLock = (props) =>
  base(
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11V8a4 4 0 118 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>,
    props
  );

export const IconMenu = (props) =>
  base(<path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />, props);

export const IconLayers = (props) =>
  base(
    <>
      <path d="M12 3l9 5-9 5-9-5 9-5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M3 13l9 5 9-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>,
    props
  );

export const IconFileText = (props) =>
  base(
    <>
      <path
        d="M7 3h7l4 4v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M14 3v4h4M9 13h6M9 17h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>,
    props
  );

export const IconDownload = (props) =>
  base(
    <path
      d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />,
    props
  );

export const IconTrash = (props) =>
  base(
    <path
      d="M5 7h14M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 13a1 1 0 001 1h6a1 1 0 001-1l1-13"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />,
    props
  );

export const IconPlus = (props) =>
  base(
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
    props
  );

export const IconRestore = (props) =>
  base(
    <>
      <path d="M4 8v5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M5.5 12a7 7 0 111.8 5.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>,
    props
  );

export const IconPaperclip = (props) =>
  base(
    <path
      d="M17 8l-7.5 7.5a2.5 2.5 0 003.5 3.5L21 11a4.5 4.5 0 00-6.5-6.5L6 13"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />,
    props
  );

export const IconCalendarWeek = (props) =>
  base(
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 14h3M7 17h3M14 14h3M14 17h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>,
    props
  );

export const IconPencil = (props) =>
  base(
    <>
      <path d="M4 20h4l10-10-4-4L4 16v4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M13.5 6.5l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>,
    props
  );

export const IconUsers = (props) =>
  base(
    <>
      <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="2" />
      <path d="M3 19c1-3 3.3-4.5 6-4.5s5 1.5 6 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 5.5a3.2 3.2 0 010 5.8M18 19c-.3-1.4-.9-2.6-1.8-3.6 1.9.3 3.6 1.6 4.3 3.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>,
    props
  );

export const IconSparkle = (props) =>
  base(
    <path
      d="M12 3l1.6 5.2a3 3 0 002.2 2.2L21 12l-5.2 1.6a3 3 0 00-2.2 2.2L12 21l-1.6-5.2a3 3 0 00-2.2-2.2L3 12l5.2-1.6a3 3 0 002.2-2.2L12 3z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />,
    props
  );

export const IconSettings = (props) =>
  base(
    <>
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2.5l1.5 2.4 2.8-.6.6 2.8 2.4 1.5-1 2.6 1 2.6-2.4 1.5-.6 2.8-2.8-.6L12 21.5l-1.5-2.4-2.8.6-.6-2.8L4.7 15.4l1-2.6-1-2.6 2.4-1.5.6-2.8 2.8.6L12 2.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </>,
    props
  );
