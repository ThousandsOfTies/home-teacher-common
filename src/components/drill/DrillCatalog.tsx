import { useTranslation } from 'react-i18next';

interface RecommendedSite {
    name: string;
    description: string;
    url: string;
    highlight: string;
    subjects: string[];
    grades: string[];
}

interface DrillCatalogProps {
    onImportConfig?: (addPDF: (file: Blob, fileName: string) => Promise<boolean>) => void;
    addPDF: (file: Blob, fileName: string) => Promise<boolean>;
    variant?: 'study' | 'drawing';
}

export default function DrillCatalog({ variant = 'study' }: DrillCatalogProps) {
    const { t } = useTranslation();
    const catalogKey = variant === 'drawing' ? 'drawingCatalog' : 'drillCatalog';
    const sites = t(`${catalogKey}.sites`, { returnObjects: true }) as RecommendedSite[];

    const handleOpenSite = (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="drill-catalog" style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
            <h2 style={{
                textAlign: 'center',
                marginBottom: '10px',
                color: '#2c3e50'
            }}>
                {t(`${catalogKey}.title`)}
            </h2>

            <p style={{
                textAlign: 'center',
                color: '#666',
                marginBottom: '25px',
                fontSize: '14px',
                lineHeight: '1.6'
            }} dangerouslySetInnerHTML={{ __html: t(`${catalogKey}.description`) }} />

            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
            }}>
                {sites.map((site) => (
                    <div
                        key={site.name}
                        style={{
                            border: '1px solid #e0e0e0',
                            borderRadius: '12px',
                            padding: '20px',
                            backgroundColor: '#fff',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                            transition: 'transform 0.2s, box-shadow 0.2s',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                            <div style={{ flex: 1, minWidth: '200px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                    <h3 style={{ margin: 0, color: '#2c3e50', fontSize: '18px' }}>
                                        {site.name}
                                    </h3>
                                    <span style={{
                                        backgroundColor: '#e8f5e9',
                                        color: '#2e7d32',
                                        padding: '3px 10px',
                                        borderRadius: '12px',
                                        fontSize: '12px',
                                        fontWeight: 'bold',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {site.highlight}
                                    </span>
                                </div>

                                <p style={{
                                    margin: '0 0 12px 0',
                                    color: '#555',
                                    fontSize: '14px',
                                    lineHeight: '1.5'
                                }}>
                                    {site.description}
                                </p>

                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{
                                        fontSize: '12px',
                                        color: '#888',
                                        backgroundColor: '#f5f5f5',
                                        padding: '2px 8px',
                                        borderRadius: '4px'
                                    }}>
                                        📖 {site.subjects.join(' / ')}
                                    </span>
                                    <span style={{
                                        fontSize: '12px',
                                        color: '#888',
                                        backgroundColor: '#f5f5f5',
                                        padding: '2px 8px',
                                        borderRadius: '4px'
                                    }}>
                                        🎒 {site.grades.join(' / ')}
                                    </span>
                                </div>
                            </div>

                            <button
                                onClick={() => handleOpenSite(site.url)}
                                style={{
                                    padding: '12px 24px',
                                    backgroundColor: 'white',
                                    color: '#3498db',
                                    border: '1px solid #3498db',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'background-color 0.2s',
                                    whiteSpace: 'nowrap'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#f0f8ff';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'white';
                                }}
                            >
                                {t(`${catalogKey}.openSite`)}
                                <span style={{ fontSize: '16px' }}>→</span>
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{
                marginTop: '30px',
                padding: '16px',
                backgroundColor: '#fff3e0',
                borderRadius: '8px',
                border: '1px solid #ffe0b2'
            }}>
                <p style={{
                    margin: 0,
                    fontSize: '13px',
                    color: '#e65100',
                    lineHeight: '1.6'
                }}>
                    <strong>{t(`${catalogKey}.tipsTitle`)}</strong><br />
                    <span dangerouslySetInnerHTML={{ __html: t(`${catalogKey}.tipsContent`) }} />
                </p>
            </div>

            <div style={{
                marginTop: '16px',
                padding: '12px',
                backgroundColor: '#f5f5f5',
                borderRadius: '8px',
                textAlign: 'center'
            }}>
                <p style={{
                    margin: 0,
                    fontSize: '11px',
                    color: '#888',
                    lineHeight: '1.5'
                }} dangerouslySetInnerHTML={{ __html: t(`${catalogKey}.disclaimer`) }} />
            </div>
        </div>
    );
}
