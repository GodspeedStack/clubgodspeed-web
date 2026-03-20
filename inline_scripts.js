
                        function commitToGodspeed(e) {
                            const card = document.querySelector('.memo-card-v3');
                            const miniBadge = document.getElementById('committed-badge-mini');
                            
                            // 1. Inject morph styles
                            if(!document.getElementById('morph-styles')) {
                                const styles = document.createElement('style');
                                styles.id = 'morph-styles';
                                styles.innerHTML = `
                                    .fade-out-morph {
                                        opacity: 0 !important;
                                        transform: scale(0.9) translateY(10px) !important;
                                        transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1), transform 0.6s cubic-bezier(0.4, 0, 0.2, 1) !important;
                                        pointer-events: none;
                                    }
                                    @keyframes badgePopSpring {
                                        0% { transform: scale(0); opacity: 0; }
                                        50% { transform: scale(1.15); opacity: 1; }
                                        70% { transform: scale(0.95); }
                                        100% { transform: scale(1); opacity: 1; }
                                    }
                                    .badge-pop {
                                        animation: badgePopSpring 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards !important;
                                    }
                                    .flying-pill {
                                        position: absolute !important;
                                        z-index: 9999;
                                        transition: transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease;
                                        will-change: transform;
                                    }
                                `;
                                document.head.appendChild(styles);
                            }
                            
                            // Generate Ghost Pill payload
                            const ctaBtn = card ? card.querySelector('.btn-primary') : null;
                            const startRect = ctaBtn ? ctaBtn.getBoundingClientRect() : (card ? card.getBoundingClientRect() : null);
                            
                            if (startRect && miniBadge) {
                                // Briefly show target to calculate absolute DOM landing coords
                                const wasHidden = miniBadge.style.display === 'none';
                                miniBadge.style.display = 'inline-flex';
                                miniBadge.style.opacity = '0';
                                const targetRect = miniBadge.getBoundingClientRect();
                                if (wasHidden) miniBadge.style.display = 'none';

                                // Calculate scroll offsets
                                const scrollY = window.scrollY;
                                const scrollX = window.scrollX;
                                
                                const startY = startRect.top + scrollY + (startRect.height / 2) - 12; // 12 is half pill height
                                const startX = startRect.left + scrollX + (startRect.width / 2) - 42; // 42 is half pill width
                                
                                const targetY = targetRect.top + scrollY;
                                const targetX = targetRect.left + scrollX;

                                // Clone badge as Ghost
                                const ghostPill = miniBadge.cloneNode(true);
                                ghostPill.id = "ghost-pill";
                                ghostPill.style.display = 'inline-flex';
                                ghostPill.style.opacity = '1';
                                ghostPill.style.margin = '0';
                                ghostPill.classList.remove('badge-pop');
                                ghostPill.classList.add('flying-pill');
                                
                                // Set initial origin 
                                ghostPill.style.left = startX + 'px';
                                ghostPill.style.top = startY + 'px';
                                ghostPill.style.transform = 'scale(0.5)';
                                document.body.appendChild(ghostPill);

                                // Trigger Reflow
                                ghostPill.offsetHeight;
                                
                                // Launch Flight and scale up
                                ghostPill.style.transform = `translate(${targetX - startX}px, ${targetY - startY}px) scale(1)`;
                            }
                            
                            // 2. Smoothly fade out the memo card immediately
                            if(card) {
                                card.style.transformOrigin = "top center";
                                card.classList.add('fade-out-morph');
                            }
                            
                            // 3. Initiate camera tracking simultaneously
                            window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
                            
                            // 4. Conclude sequence at 800ms
                            setTimeout(() => {
                                if(card) card.style.display = 'none';
                                
                                const ghost = document.getElementById('ghost-pill');
                                if (ghost) ghost.remove();
                                
                                miniBadge.style.display = 'inline-flex';
                                miniBadge.style.opacity = '1';
                                miniBadge.style.transform = 'scale(1)';
                                miniBadge.classList.add('badge-pop');
                            }, 800);

                            // 5. Log Commitment
                            const email = localStorage.getItem('gba_user_email') || 'Guest Parent';
                            const db = JSON.parse(localStorage.getItem('gba_db')) || {};
                            if (!db.commits) db.commits = [];
                            db.commits.push({ parentId: email, date: new Date().toISOString() });
                            localStorage.setItem('gba_db', JSON.stringify(db));
                        }
                        
                        // Boot check: if already committed, show the badge silently
                        document.addEventListener('DOMContentLoaded', () => {
                            const email = localStorage.getItem('gba_user_email') || 'Guest Parent';
                            const db = JSON.parse(localStorage.getItem('gba_db')) || {};
                            const hasCommitted = (db.commits || []).some(c => c.parentId === email);
                            if (hasCommitted) {
                                const miniBadge = document.getElementById('committed-badge-mini');
                                if(miniBadge) {
                                    miniBadge.style.display = 'inline-flex';
                                    miniBadge.style.opacity = '1';
                                    miniBadge.style.transform = 'scale(1)';
                                }
                                const card = document.querySelector('.memo-card-v3');
                                if(card) card.style.display = 'none';
                            }
                        });
                    
