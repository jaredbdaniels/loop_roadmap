import { MISSION_INFO } from "@/lib/loop/constants";

// Renders a team name with an on-hover tooltip naming the core domain it rolls
// up to (and that domain's owner). Used everywhere a team name is displayed.
// Teams are the product-area sub-domains (Communication, Family, Staff, …).
export function MissionTag({
  mission,
  className,
}: {
  mission: string;
  className?: string;
}) {
  const info = MISSION_INFO[mission];
  const tip = info ? `${mission} — ${info}` : mission;
  return (
    <span
      className={className ? `mission-tip ${className}` : "mission-tip"}
      title={tip}
      aria-label={tip}
    >
      {mission}
    </span>
  );
}
