// Static legal pages in web/public, required by Google's OAuth consent screen.
const linkProps = { target: '_blank', rel: 'noreferrer' } as const;

export function TermsLink() {
  return (
    <a href="terms.html" {...linkProps}>
      Terms of Service
    </a>
  );
}

export function PrivacyLink() {
  return (
    <a href="privacy.html" {...linkProps}>
      Privacy Policy
    </a>
  );
}

/** "Terms of Service · Privacy Policy" for footers and sign-in screens. */
export function LegalLinks() {
  return (
    <>
      <TermsLink /> · <PrivacyLink />
    </>
  );
}
