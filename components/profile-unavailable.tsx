import { Activity, Award, Crown, Shield, Swords, Trophy } from 'lucide-react';

type ProfileState = 'loading' | 'unselected' | 'unavailable';
const messages: Record<ProfileState, { title: string; detail: string; activity: string }> = {
  loading: {
    title: 'Je spelgegevens worden opgehaald',
    detail: 'Je RuneScape-account en de laatst beschikbare metingen worden gecontroleerd.',
    activity: 'Je recente level-ups, bosskills en eventresultaten worden opgehaald.',
  },
  unselected: {
    title: 'Kies je RuneScape-account',
    detail: 'Selecteer je naam bij Jouw RuneScape-account. Hier verschijnen daarna jouw spelgegevens.',
    activity: 'Kies je RuneScape-account om je recente activiteiten te bekijken.',
  },
  unavailable: {
    title: 'Je spelgegevens zijn tijdelijk niet beschikbaar',
    detail: 'De gegevens konden nog niet worden opgehaald. Probeer het opnieuw bij Jouw RuneScape-account.',
    activity: 'Je activiteiten kunnen nu niet worden opgehaald. Dit betekent niet dat je geen recente activiteiten hebt.',
  },
};

export default function ProfileUnavailable({ state }: { state: ProfileState }) {
  const message = messages[state];
  return <>
    <div className="profile-unavailable-state" role="status"><strong>{message.title}</strong><p>{message.detail}</p></div>
    <div className="profile-highlights">
      <section className="profile-boss-card" aria-labelledby="favourite-boss-title">
        <p className="profile-section-label"><Swords size={15}/> JOUW SIGNATUUR</p>
        <h2 id="favourite-boss-title">Favoriete boss</h2>
        <div className="profile-boss-focus"><span className="profile-boss-emblem"><Swords size={40}/></span><div><h3>—</h3><strong>— <small>KC</small></strong><span>Hoogste geregistreerde killcount</span></div></div>
        <p className="profile-feature-note">Je meest verslagen boss en je top drie verschijnen zodra de bossgegevens beschikbaar zijn.</p>
      </section>
      <section className="profile-rank-card" aria-labelledby="clan-rank-title">
        <p className="profile-section-label"><Shield size={15}/> JOUW PLEK IN DE CLAN</p>
        <h2 id="clan-rank-title">Clanrang & voortgang</h2>
        <div className="profile-current-rank"><span className="profile-rank-emblem"><Crown size={30}/></span><div><span>Huidige rang</span><h3>—</h3><small>Nog niet beschikbaar</small></div></div>
        <div className="profile-rank-target"><span>Voortgang naar je volgende rang</span><strong>—</strong></div>
        <p className="profile-rank-count"><strong>—</strong> bevestigde events</p>
        <p className="profile-feature-note">Je voortgang is gebaseerd op deelname aan clanevents. Je rang en het volgende doel verschijnen zodra je gegevens beschikbaar zijn.</p>
      </section>
    </div>
    <section className="profile-trophy-cabinet" aria-labelledby="profile-trophy-title">
      <div><p className="profile-section-label"><Award size={15}/> VERDIEND MET DE CLAN</p><h2 id="profile-trophy-title">Jouw prijzenkast</h2><p>Podiumplaatsen verschijnen zodra je afgeronde eventresultaten beschikbaar zijn.</p></div>
      <div className="profile-medals">{['Goud', 'Zilver', 'Brons'].map((name, index) => <div className={`profile-medal medal-${index + 1}`} key={name}><Trophy size={22}/><strong>—</strong><span>{name}</span></div>)}</div>
    </section>
    <section className="member-activity-panel profile-activity-unavailable" aria-labelledby="activity-title">
      <div className="activity-heading"><div><p className="profile-section-label"><Activity size={15}/> HET AVONTUUR GAAT DOOR</p><h2 id="activity-title">Laatste activiteiten</h2></div><span>MAX. 10</span></div>
      <p className="activity-empty">{message.activity}</p>
      <p className="profile-feature-note activity-source">Level-ups, bosskills en bevestigde eventresultaten via Wise Old Man.</p>
    </section>
  </>;
}
