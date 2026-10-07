import { useTranslation } from 'react-i18next'
import React from 'react';
import './Legal.css';

const APP_NAME = import.meta.env.VITE_APP_NAME || 'TutoTuto';

interface AboutProps {
    onClose: () => void;
}

const About: React.FC<AboutProps> = ({ onClose }) => {
  const { t } = useTranslation()

    return (
        <div className="legal-modal-overlay" onClick={onClose}>
            <div className="legal-modal" onClick={(e) => e.stopPropagation()}>
                <div className="legal-modal-header">
                    <h2>{t('legal.about.title', { app: APP_NAME })}</h2>
                    <button className="legal-modal-close" onClick={onClose} title={t('common.close')}>
                        ✕
                    </button>
                </div>

                <div className="legal-modal-content">
                    <h3>{t('legal.about.introTitle', { app: APP_NAME })}</h3>
                    <p>
                        {t('legal.about.intro', { app: APP_NAME })}</p>

                    <h3>{t('legal.about.featuresTitle')}</h3>
                    <ul>
                        <li><strong>{t('legal.about.pdfTitle')}</strong> {t('legal.about.pdfDescription')}</li>
                        <li><strong>{t('legal.about.drawingTitle')}</strong> {t('legal.about.drawingDescription')}</li>
                        <li><strong>{t('legal.about.gradingTitle')}</strong> {t('legal.about.gradingDescription')}</li>
                        <li><strong>{t('legal.about.snsTitle')}</strong> {t('legal.about.snsDescription')}</li>
                        <li><strong>{t('legal.about.historyTitle')}</strong> {t('legal.about.historyDescription')}</li>
                    </ul>

                    <h3>{t('legal.about.devicesTitle')}</h3>
                    <p>{t('legal.about.devicesDescription')}</p>
                    <ul>
                        <li>{t('legal.about.ios')}</li>
                        <li>{t('legal.about.windows')}</li>
                        <li>{t('legal.about.mac')}</li>
                        <li>{t('legal.about.android')}</li>
                    </ul>

                    <h3>{t('legal.about.operatorTitle')}</h3>
                    <div style={{
                        backgroundColor: '#f8f9fa',
                        padding: '16px',
                        borderRadius: '8px',
                        margin: '16px 0'
                    }}>
                        <p style={{ margin: '0 0 8px 0' }}>
                            <strong>{t('legal.about.operator')}</strong> ThousandsOfTies
                        </p>
                        <p style={{ margin: '0 0 8px 0' }}>
                            <strong>{t('legal.email')}</strong>{' '}
                            <a href="mailto:thousands.of.ties@gmail.com" style={{ color: '#3498db' }}>
                                thousands.of.ties@gmail.com
                            </a>
                        </p>
                        <p style={{ margin: 0 }}>
                            <strong>{t('legal.about.github')}</strong>{' '}
                            <a
                                href="https://github.com/ThousandsOfTies"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: '#3498db' }}
                            >
                                github.com/ThousandsOfTies
                            </a>
                        </p>
                    </div>

                    <h3>{t('legal.about.versionTitle')}</h3>
                    <p>
                        <strong>{t('legal.about.version')}</strong> 0.2.1
                    </p>
                    <div style={{ marginTop: '20px', padding: '10px', background: '#f5f5f5', borderRadius: '4px', fontSize: '0.8rem' }}>
                        <p><strong>{t('legal.about.debug')}</strong></p>
                        <p style={{ wordBreak: 'break-all' }}>{t('legal.about.url')}{window.location.href}</p>
                        <p>{t('legal.about.premium')}{localStorage.getItem('userSettings') && JSON.parse(localStorage.getItem('userSettings') || '{}').isPremium ? t('common.yes') : t('common.no')}</p>
                    </div>

                    <h3>{t('legal.about.creditsTitle')}</h3>
                    <p>
                        {t('legal.about.creditsDescription', { app: APP_NAME })}</p>
                    <ul>
                        <li>{t('legal.about.react')}</li>
                        <li>{t('legal.about.vite')}</li>
                        <li>{t('legal.about.pdfjs')}</li>
                        <li>{t('legal.about.gemini')}</li>
                    </ul>

                    <h3>{t('legal.about.disclaimerTitle')}</h3>
                    <div style={{
                        backgroundColor: '#fff3cd',
                        border: '1px solid #ffc107',
                        padding: '16px',
                        borderRadius: '8px',
                        margin: '16px 0'
                    }}>
                        <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: '#856404' }}>
                            {t('legal.about.aiTitle')}</p>
                        <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.6', color: '#856404' }}>
                            {t('legal.about.aiBefore')}<strong>{t('legal.about.aiWarning')}</strong>{t('legal.about.aiAfter')}</p>
                    </div>
                </div>

                <div className="legal-modal-footer">
                    <button onClick={onClose}>{t('common.close')}</button>
                </div>
            </div>
        </div>
    );
};

export default About;
