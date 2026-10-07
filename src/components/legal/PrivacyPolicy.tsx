import { useTranslation } from 'react-i18next'
import React from 'react';
import './Legal.css';

const APP_NAME = import.meta.env.VITE_APP_NAME || 'TutoTuto';

interface PrivacyPolicyProps {
  onClose: () => void;
}

const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onClose }) => {
  const { t } = useTranslation()

  return (
    <div className="legal-modal-overlay" onClick={onClose}>
      <div className="legal-modal" onClick={(e) => e.stopPropagation()}>
        <div className="legal-modal-header">
          <h2>{t('legal.privacy.title')}</h2>
          <button className="legal-modal-close" onClick={onClose} title={t('common.close')}>
            ✕
          </button>
        </div>

        <div className="legal-modal-content">
          <p className="legal-last-updated">{t('legal.lastUpdated')}</p>

          <p>
            {t('legal.privacy.intro', { app: APP_NAME })}</p>

          <h3>{t('legal.privacy.collectionTitle')}</h3>
          <p>{t('legal.privacy.collectionDescription')}</p>
          <ul>
            <li>{t('legal.privacy.pdf')}</li>
            <li>{t('legal.privacy.handwriting')}</li>
            <li>{t('legal.privacy.history')}</li>
            <li>{t('legal.privacy.settings')}</li>
          </ul>
          <p>
            <strong>{t('legal.privacy.localData')}</strong>
          </p>

          <h3>{t('legal.privacy.aiTitle')}</h3>
          <p>
            {t('legal.privacy.aiDescription')}</p>

          <h3>{t('legal.privacy.adsTitle')}</h3>
          <p>
            {t('legal.privacy.adsDescription')}</p>
          <p>
            {t('legal.privacy.adsBefore')}<a href="https://policies.google.com/technologies/ads?hl=ja" target="_blank" rel="noopener noreferrer">
              {t('legal.privacy.adsLink')}</a>
            {t('legal.privacy.adsAfter')}</p>

          <h3>{t('legal.privacy.cookiesTitle')}</h3>
          <p>
            {t('legal.privacy.cookiesDescription')}</p>

          <h3>{t('legal.privacy.deleteTitle')}</h3>
          <p>
            {t('legal.privacy.deleteDescription')}</p>

          <h3>{t('legal.privacy.contactTitle')}</h3>
          <p>
            {t('legal.privacy.contactDescription')}</p>
          <p>
            <strong>{t('legal.email')}</strong> thousands.of.ties@gmail.com
          </p>

          <h3>{t('legal.privacy.changesTitle')}</h3>
          <p>
            {t('legal.privacy.changesDescription')}</p>
        </div>

        <div className="legal-modal-footer">
          <button onClick={onClose}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
