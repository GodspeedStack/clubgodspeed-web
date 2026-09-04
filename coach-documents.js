/**
 * GODSPEED BASKETBALL. Coach document pack.
 *
 * Contract:
 *   window.COACH_DOCUMENTS : Array<{ id, version, title, summary, required, html }>
 *   - id + version together identify a signature (coach_agreements unique index).
 *   - Bump `version` when the text changes in a way a coach should re-sign.
 *   - `html` may use {coach_name}, {coach_email}, {today}. The wizard fills them.
 *   - Coach-facing copy: short words, short sentences, no jargon, no em dashes.
 *
 * STATUS: DRAFT. Prepared 2026-09-03 for Scott's review before the first coach
 * signs. These are program acknowledgments written in plain language; they are
 * not legal advice and are not a substitute for review by a Colorado attorney.
 */
(function () {
  'use strict';

  const DOCS = [
    {
      id: 'coach-code-of-conduct',
      version: '2026.1',
      title: 'Coach Code of Conduct',
      summary: 'How we carry ourselves with players, parents, referees, and each other.',
      required: true,
      html: `
        <h3>Coach Code of Conduct</h3>
        <p class="doc-meta">Godspeed Basketball. Version 2026.1</p>
        <p>I, <strong>{coach_name}</strong>, am a coach with Godspeed Basketball. I agree to the standards below. They apply at every practice, game, trip, and any time I represent Godspeed.</p>

        <h4>1. The kids come first</h4>
        <p>Every athlete is treated with respect. I teach, I correct, and I encourage. I do not shame, mock, or single out a player in a way meant to embarrass them. I never touch a player in anger.</p>

        <h4>2. Brotherhood. Habits. Success.</h4>
        <p>I model the habits I ask of players: on time, prepared, in control of my words and my temper. I hold players to the standard and I hold myself to it first.</p>

        <h4>3. Two-adult rule</h4>
        <p>I am never alone with a single athlete in a private setting. If a one-on-one talk is needed, it happens where another adult can see us. I do not give a player a ride alone unless the parent has agreed in writing and I have told a Godspeed director.</p>

        <h4>4. Communication with players</h4>
        <p>I do not text, message, or follow athletes on social media privately. Team communication goes through the parent, the team group, or the Godspeed portal.</p>

        <h4>5. Referees, opponents, and parents</h4>
        <p>I speak to officials with respect, even when I disagree. I do not argue with opposing coaches or fans. If a parent has a concern, I listen, then bring it to a director. I do not discuss another family's child, dues, or discipline with anyone who is not a director.</p>

        <h4>6. Substances</h4>
        <p>No alcohol, tobacco, vaping, or drugs at any team activity, and never in front of athletes.</p>

        <h4>7. Money and gear</h4>
        <p>I do not collect money from families. Dues, fees, and gear orders go through the Godspeed portal or a director.</p>

        <h4>8. Reporting</h4>
        <p>If I see or hear of abuse, bullying, hazing, or a safety risk, I report it to a director the same day. If a child is in immediate danger I call 911 first.</p>

        <h4>9. Consequences</h4>
        <p>Breaking this code can mean a warning, a suspension, or removal from the program. Directors decide.</p>

        <p>By signing, I confirm I have read this code and I agree to follow it.</p>
      `,
    },

    {
      id: 'coach-background-check-consent',
      version: '2026.1',
      title: 'Background Check Consent',
      summary: 'You agree to a background check before working with athletes.',
      required: true,
      html: `
        <h3>Background Check Consent</h3>
        <p class="doc-meta">Godspeed Basketball. Version 2026.1</p>
        <p>Godspeed Basketball runs a background check on every adult who coaches or supervises athletes. This protects the kids, the families, and you.</p>

        <h4>What I agree to</h4>
        <p>I, <strong>{coach_name}</strong>, give Godspeed Basketball permission to run a background check on me through a screening service it chooses. The check may include criminal records, sex offender registries, and identity verification.</p>

        <h4>What I confirm</h4>
        <p>I have never been convicted of, or pleaded guilty to, a crime against a child, a sex offense, or a violent felony. The information I give for the check is true and complete.</p>

        <h4>How results are handled</h4>
        <p>Results are seen only by Godspeed directors. They are kept private and are not shared with parents or other coaches. If something comes back that affects my eligibility, a director will talk with me before any decision is made.</p>

        <h4>Ongoing duty</h4>
        <p>If I am charged with a crime while I coach with Godspeed, I will tell a director within 48 hours.</p>

        <p>By signing, I give my consent and confirm the statements above are true.</p>
      `,
    },

    {
      id: 'coach-safety-acknowledgment',
      version: '2026.1',
      title: 'Concussion and Athlete Safety Acknowledgment',
      summary: 'Concussion protocol, injuries, heat, and the SafeSport basics.',
      required: true,
      html: `
        <h3>Concussion and Athlete Safety Acknowledgment</h3>
        <p class="doc-meta">Godspeed Basketball. Version 2026.1</p>
        <p>I, <strong>{coach_name}</strong>, understand and agree to the following.</p>

        <h4>1. Concussions</h4>
        <p>If a player takes a hit to the head or body and shows any sign of a concussion (headache, dizziness, confusion, nausea, blurry vision, acting off), I pull them from play right away. They do not return that day. They return to practice or games only with written clearance from a medical provider. When in doubt, sit them out. This follows Colorado's Jake Snakenberg Youth Sports Concussion Act.</p>

        <h4>2. Injuries</h4>
        <p>I stop play for any injury. I do not move a player who cannot move on their own. I call 911 for anything serious. I tell the parent the same day and I tell a director.</p>

        <h4>3. Heat, water, rest</h4>
        <p>Water is always available. Players get water breaks at least every 20 minutes in hot gyms. I do not use exercise as punishment.</p>

        <h4>4. Emergency information</h4>
        <p>I know where each athlete's emergency contact and medical notes live in the Godspeed portal, and I check them before the first practice with a new team.</p>

        <h4>5. Abuse prevention (SafeSport basics)</h4>
        <p>I follow the two-adult rule. I do not have private contact with athletes. I do not tolerate bullying, hazing, or harassment, and I report any concern to a director the same day. I will complete the U.S. Center for SafeSport core training when Godspeed asks me to.</p>

        <h4>6. Training</h4>
        <p>I will complete a free concussion course (CDC HEADS UP or equivalent) within 30 days of signing this and send the certificate to a director.</p>

        <p>By signing, I confirm I have read this and I will follow it.</p>
      `,
    },

    {
      id: 'coach-role-acknowledgment',
      version: '2026.1',
      title: 'Coaching Role Acknowledgment',
      summary: 'What your role is, what it is not, and how pay or reimbursement works.',
      required: true,
      html: `
        <h3>Coaching Role Acknowledgment</h3>
        <p class="doc-meta">Godspeed Basketball. Version 2026.1</p>
        <p>I, <strong>{coach_name}</strong>, understand the terms of my role with Godspeed Basketball.</p>

        <h4>1. My role</h4>
        <p>I coach as a volunteer or as an independent contractor, as agreed in writing with a director. I am not an employee of Godspeed Basketball. I set my own methods within the Godspeed program and the Code of Conduct.</p>

        <h4>2. Pay and reimbursement</h4>
        <p>If I am paid, the amount and timing are set in writing with a director before the season. I am responsible for my own taxes. Expenses are reimbursed only if a director approves them in advance.</p>

        <h4>3. Schedule</h4>
        <p>I commit to the practice and game schedule for my team. If I cannot make a session, I tell a director as early as I can, at least 24 hours ahead when possible, so coverage can be arranged.</p>

        <h4>4. Godspeed property and information</h4>
        <p>Rosters, parent contact information, player evaluations, and portal access are Godspeed property. I use them only for coaching, and I do not share them outside the program. When I leave, my portal access ends.</p>

        <h4>5. Ending the role</h4>
        <p>Either of us can end this arrangement at any time with notice. I will finish the week's sessions if asked and return any team gear.</p>

        <h4>6. Insurance</h4>
        <p>Godspeed carries the program's general liability coverage. It does not cover my personal vehicle or my personal health. I keep my own auto insurance if I ever drive for a team activity.</p>

        <p>By signing, I confirm I understand my role as described.</p>
      `,
    },

    {
      id: 'coach-confidentiality-nda',
      version: '2026.1',
      title: 'Confidentiality and Non-Disclosure Agreement',
      summary: 'What counts as private program information and how you protect it, now and after you leave.',
      required: true,
      html: `
        <h3>Confidentiality and Non-Disclosure Agreement</h3>
        <p class="doc-meta">Godspeed Basketball. Version 2026.1</p>
        <p>I, <strong>{coach_name}</strong>, will have access to private Godspeed information while I coach. I agree to the following.</p>

        <h4>1. What is confidential</h4>
        <p>Confidential information includes rosters and family contact details, player evaluations, medical and payment information, the playbook and development system, business plans, pricing, and any program material that is not public.</p>

        <h4>2. How I use it</h4>
        <p>I use confidential information only to do my coaching job. I do not share it with anyone outside the program without permission from a director. I do not post it online or forward it by text or email.</p>

        <h4>3. No use against Godspeed</h4>
        <p>I will not use confidential information to compete with Godspeed or to help another program.</p>

        <h4>4. When I leave</h4>
        <p>When I leave the staff, I return or delete all confidential materials I have. My duty to protect player and family privacy never ends.</p>

        <h4>5. Why this matters</h4>
        <p>This protects our players, their families, and the program we are building together.</p>

        <p>By signing, I confirm I have read this and I will follow it.</p>
      `,
    },

    {
      id: 'coach-5th-white-team-commitment',
      version: '2026.1',
      title: '5th Grade White Team Commitment',
      summary: 'How we coach this team: spacing first, the system, and the commitment we ask of every coach.',
      required: true,
      html: `
        <h3>5th Grade White Team Commitment</h3>
        <p class="doc-meta">Godspeed Basketball. Version 2026.1</p>
        <p>I, <strong>{coach_name}</strong>, am joining the 5th Grade White coaching staff. I understand and agree to the following.</p>

        <h4>1. Spacing comes first</h4>
        <p>Spacing is the number one thing with this team. Before any set or play, I will teach how we want the floor spaced. I will reinforce spacing in every drill, every scrimmage, and every game.</p>

        <h4>2. Our system</h4>
        <p>I will coach the Godspeed system as it is written in the 5th Grade White Playbook in the Coach Portal: the Square, the fill cut, beating the press, man to man defense, and special situations. I will not bring in outside plays or sets without talking to a director first.</p>

        <h4>3. My commitment</h4>
        <p>I will help run practices, develop players, coach games, and uphold the Godspeed standard, working under the Program Director and head coach. I commit to scheduled practice nights, games, and reasonable preparation time. I tell a director about conflicts in advance.</p>

        <h4>4. Development over winning</h4>
        <p>At this age we grow players. Every player on the roster gets coached and gets meaningful playing time. I measure success by how much better our players get, not by the scoreboard.</p>

        <h4>5. Program rules</h4>
        <p>I will follow all program policies, including the Code of Conduct, the Safety Acknowledgment, and the Confidentiality Agreement.</p>

        <p>I am signing on because I believe in building complete players and a real brotherhood.</p>
      `,
    },
  ];

  window.COACH_DOCUMENTS = DOCS;
})();
