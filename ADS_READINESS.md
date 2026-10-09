# AutoType advertising readiness (beta)

This is a staged layout plan, not permission to run ads or an approval guarantee.

## Currently implemented
- Public About, Privacy Policy and Contact & Support pages, linked from the site footer.
- Support and privacy forwarding aliases are configured in Squarespace: `support@auto-type.net` and `privacy@auto-type.net`. Inbound delivery was confirmed through test messages by the site owner.
- Responsive, **hidden** ad-inventory landmarks below homepage discovery, leaderboard content and How to Play content.
- A site-owned preview via `?ad-preview=1` on those three pages. Preview never loads third-party ads, sets cookies, or pays out.
- An AdSense **verification-only** meta tag using the publisher ID shown in the site owner’s latest AdSense screen is in each HTML `<head>`. The tag is public and does not load ads or track visitors.
- No advertising JavaScript, live ad slots, forced ad clicks, rewarded viewing, overlays or automatic placements.
- A root `ads.txt` file authorizes only the current AdSense account, which does not itself activate ads.
- Active typing, NPC matches, mobile keyboard viewport, Plinko, accounts, messages, profiles, settings, admin and shop remain free of ads.
- Normal site visitors never see the preview.

## Pending before any real AdSense integration
1. Use only an **eligible account holder** and provide accurate payment/identity information. AdSense requires publishers to be at least 18; a parent or guardian can own an account if the site operator is younger.
2. Periodically check both forwarding aliases, and keep the contact addresses current. Forwarding does not automatically make outgoing mail appear to come from the AutoType domain.
3. Review the drafted privacy disclosures with the site operator, including all current provider and retention details, and revise as needed.
4. European and US privacy messages were published in the AdSense dashboard. Before any live ad scripts load, verify the consent message is actually integrated and honors regional visitor choices, including on mobile. Keep auto ads **off**.
5. Site ownership is verified and the AdSense site review has been requested (October 9, 2026). Wait for Google to decide whether the site is eligible; review submission is not approval.
6. After site approval, get official ad-unit IDs and add clearly labeled, responsive in-page units only to the three safe placements. Keep advertising separate from game controls and avoid accidental clicks.
7. The exact `ads.txt` record provided for `pub-9541821976044642` is now in the website root. Confirm `https://auto-type.net/ads.txt` serves that plain text after deployment; Google may take time to recognize it.
8. Test on mobile, with screen reader and privacy choices, monitor performance, and confirm that the active game remains unaffected.

## Recommended eventual placements
- Homepage: one content-separated banner after the game mode discovery grid.
- Leaderboard: one after the entire rankings section, not among entries or claims.
- How to Play: one after instructions, never near the tutorial controls.

References:
- https://support.google.com/adsense/answer/1348695
- https://support.google.com/adsense/answer/13554116
- https://support.google.com/adsense/answer/1346295
