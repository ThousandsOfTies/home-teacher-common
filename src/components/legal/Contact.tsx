import { useTranslation } from 'react-i18next'
import React from 'react';
import './Legal.css';

interface ContactProps {
    onClose: () => void;
}

const Contact: React.FC<ContactProps> = ({ onClose }) => {
  const { t } = useTranslation()

    return (
        <div className="legal-modal-overlay" onClick={onClose}>
            <div className="legal-modal" onClick={(e) => e.stopPropagation()}>
                <div className="legal-modal-header">
                    <h2>{t('legal.contact.title')}</h2>
                    <button className="legal-modal-close" onClick={onClose} title={t('common.close')}>
                        ✕
                    </button>
                </div>

                <div className="legal-modal-content">
                    <h3>{t('legal.contact.addressTitle')}</h3>
                    <p>
                        {t('legal.contact.intro')}</p>

                    <div style={{
                        backgroundColor: '#f8f9fa',
                        padding: '20px',
                        borderRadius: '8px',
                        textAlign: 'center',
                        margin: '20px 0'
                    }}>
                        <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#7f8c8d' }}>
                            {t('legal.contact.email')}</p>
                        <a
                            href="mailto:thousands.of.ties@gmail.com"
                            style={{
                                fontSize: '18px',
                                fontWeight: '600',
                                color: '#3498db',
                                textDecoration: 'none'
                            }}
                        >
                            thousands.of.ties@gmail.com
                        </a>
                    </div>

                    <h3>{t('legal.contact.notesTitle')}</h3>
                    <ul>
                        <li>{t('legal.contact.responseTime')}</li>
                        <li>{t('legal.contact.deviceInfo')}</li>
                        <li>{t('legal.contact.reply')}</li>
                    </ul>

                    <h3>{t('legal.contact.faqTitle')}</h3>

                    <p><strong>{t('legal.contact.storageQuestion')}</strong></p>
                    <p>
                        {t('legal.contact.storageAnswer')}</p>

                    <p><strong>{t('legal.contact.syncQuestion')}</strong></p>
                    <p>
                        {t('legal.contact.syncAnswer')}</p>

                    <p><strong>{t('legal.contact.deleteQuestion')}</strong></p>
                    <p>
                        {t('legal.contact.deleteAnswer')}</p>
                </div>

                <div className="legal-modal-footer">
                    <button onClick={onClose}>{t('common.close')}</button>
                </div>
            </div>
        </div>
    );
};

export default Contact;
