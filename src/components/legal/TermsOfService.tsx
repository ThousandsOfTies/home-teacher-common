import { useTranslation } from 'react-i18next'
import React from 'react';
import './Legal.css';

interface TermsOfServiceProps {
    onClose: () => void;
}

const TermsOfService: React.FC<TermsOfServiceProps> = ({ onClose }) => {
  const { t } = useTranslation()

    return (
        <div className="legal-modal-overlay" onClick={onClose}>
            <div className="legal-modal" onClick={(e) => e.stopPropagation()}>
                <div className="legal-modal-header">
                    <h2>{t('legal.terms.title')}</h2>
                    <button className="legal-modal-close" onClick={onClose} title={t('common.close')}>
                        ✕
                    </button>
                </div>

                <div className="legal-modal-content">
                    <p className="legal-last-updated">{t('legal.lastUpdated')}</p>

                    <p>
                        {t('legal.terms.intro')}</p>

                    <h3>{t('legal.terms.serviceTitle')}</h3>
                    <p>
                        {t('legal.terms.serviceDescription')}</p>
                    <ul>
                        <li>{t('legal.terms.pdf')}</li>
                        <li>{t('legal.terms.handwriting')}</li>
                        <li>{t('legal.terms.grading')}</li>
                        <li>{t('legal.terms.progress')}</li>
                        <li>{t('legal.terms.sns')}</li>
                    </ul>

                    <h3>{t('legal.terms.conditionsTitle')}</h3>
                    <p>{t('legal.terms.conditionsDescription')}</p>
                    <ul>
                        <li>{t('legal.terms.parentalUse')}</li>
                        <li>{t('legal.terms.agreement')}</li>
                        <li>{t('legal.terms.compliance')}</li>
                    </ul>

                    <h3>{t('legal.terms.prohibitedTitle')}</h3>
                    <p>{t('legal.terms.prohibitedDescription')}</p>
                    <ul>
                        <li>{t('legal.terms.unlawfulUse')}</li>
                        <li>{t('legal.terms.overload')}</li>
                        <li>{t('legal.terms.excessiveGrading')}</li>
                        <li>{t('legal.terms.sourceCode')}</li>
                        <li>{t('legal.terms.copyright')}</li>
                        <li>{t('legal.terms.rights')}</li>
                    </ul>

                    <h3>{t('legal.terms.disclaimerTitle')}</h3>
                    <p>
                        {t('legal.terms.disclaimerDescription')}</p>
                    <ul>
                        <li>{t('legal.terms.damage')}</li>
                        <li>{t('legal.terms.accuracy')}</li>
                        <li>{t('legal.terms.dataLoss')}</li>
                        <li>{t('legal.terms.interruption')}</li>
                        <li>{t('legal.terms.thirdPartyAccess')}</li>
                    </ul>

                    <h3>{t('legal.terms.adsTitle')}</h3>
                    <p>
                        {t('legal.terms.adsDescription')}</p>

                    <h3>{t('legal.terms.serviceChangesTitle')}</h3>
                    <p>
                        {t('legal.terms.serviceChangesDescription')}</p>

                    <h3>{t('legal.terms.restrictionsTitle')}</h3>
                    <p>
                        {t('legal.terms.restrictionsDescription')}</p>
                    <ul>
                        <li>{t('legal.terms.excessiveUse')}</li>
                        <li>{t('legal.terms.violation')}</li>
                        <li>{t('legal.terms.stability')}</li>
                        <li>{t('legal.terms.costs')}</li>
                    </ul>

                    <h3>{t('legal.terms.termsChangesTitle')}</h3>
                    <p>
                        {t('legal.terms.termsChangesDescription')}</p>

                    <h3>{t('legal.terms.lawTitle')}</h3>
                    <p>
                        {t('legal.terms.lawDescription')}</p>

                    <h3>{t('legal.terms.contactTitle')}</h3>
                    <p>
                        {t('legal.terms.contactDescription')}</p>
                    <p>
                        <strong>{t('legal.email')}</strong> thousands.of.ties@gmail.com
                    </p>
                </div>

                <div className="legal-modal-footer">
                    <button onClick={onClose}>{t('common.close')}</button>
                </div>
            </div>
        </div>
    );
};

export default TermsOfService;
