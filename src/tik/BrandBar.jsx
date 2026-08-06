// The office system's brand bar — the "ניהול בקליק" logo, always at the top.
// Rendered by the entry Shell above every office screen (not the public chat).
export default function BrandBar() {
  return (
    <div className="brandbar">
      <a className="brandbar-link" href="#registry" title="ניהול בקליק — לדף הבית">
        <img className="brandbar-logo" src="./nihul-belick.png" alt="ניהול בקליק" />
      </a>
    </div>
  );
}
