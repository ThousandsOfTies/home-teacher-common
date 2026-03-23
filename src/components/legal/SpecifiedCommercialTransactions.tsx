import React from 'react';
import './Legal.css';

interface SpecifiedCommercialTransactionsProps {
    onClose: () => void;
}

const SpecifiedCommercialTransactions: React.FC<SpecifiedCommercialTransactionsProps> = ({ onClose }) => {
    return (
        <div className="legal-modal-overlay" onClick={onClose}>
            <div className="legal-modal" onClick={(e) => e.stopPropagation()}>
                <div className="legal-modal-header">
                    <h2>🏪 特定商取引法に基づく表記</h2>
                    <button className="legal-modal-close" onClick={onClose} title="閉じる">
                        ✕
                    </button>
                </div>

                <div className="legal-modal-content">
                    <p className="legal-last-updated">最終更新日: 2026年3月23日</p>

                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
                        <tbody>
                            <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                                <th style={{ padding: '10px 8px', textAlign: 'left', whiteSpace: 'nowrap', width: '40%', verticalAlign: 'top', color: '#555' }}>販売事業者名</th>
                                <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>ゆるふわアプリ工房</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                                <th style={{ padding: '10px 8px', textAlign: 'left', whiteSpace: 'nowrap', verticalAlign: 'top', color: '#555' }}>運営責任者</th>
                                <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>森田 安信</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                                <th style={{ padding: '10px 8px', textAlign: 'left', whiteSpace: 'nowrap', verticalAlign: 'top', color: '#555' }}>所在地</th>
                                <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>東京都府中市美好町</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                                <th style={{ padding: '10px 8px', textAlign: 'left', whiteSpace: 'nowrap', verticalAlign: 'top', color: '#555' }}>電話番号</th>
                                <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>080-3578-8635<br /><small style={{ color: '#888' }}>※お問い合わせはメールにてお願いいたします</small></td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                                <th style={{ padding: '10px 8px', textAlign: 'left', whiteSpace: 'nowrap', verticalAlign: 'top', color: '#555' }}>メールアドレス</th>
                                <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>thousands.of.ties@gmail.com</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                                <th style={{ padding: '10px 8px', textAlign: 'left', whiteSpace: 'nowrap', verticalAlign: 'top', color: '#555' }}>販売価格</th>
                                <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>月額 500円（税込）</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                                <th style={{ padding: '10px 8px', textAlign: 'left', whiteSpace: 'nowrap', verticalAlign: 'top', color: '#555' }}>販売価格以外の<br />必要費用</th>
                                <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>インターネット接続料金（お客様のご負担）</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                                <th style={{ padding: '10px 8px', textAlign: 'left', whiteSpace: 'nowrap', verticalAlign: 'top', color: '#555' }}>支払方法</th>
                                <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>クレジットカード決済（Visa、Mastercard、American Express、JCB）</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                                <th style={{ padding: '10px 8px', textAlign: 'left', whiteSpace: 'nowrap', verticalAlign: 'top', color: '#555' }}>支払時期</th>
                                <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>お申し込み時に初回決済。以降、毎月同日に自動更新・自動決済</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                                <th style={{ padding: '10px 8px', textAlign: 'left', whiteSpace: 'nowrap', verticalAlign: 'top', color: '#555' }}>サービス提供時期</th>
                                <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>決済完了後、即時ご利用いただけます</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                                <th style={{ padding: '10px 8px', textAlign: 'left', whiteSpace: 'nowrap', verticalAlign: 'top', color: '#555' }}>解約方法</th>
                                <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>アプリ内の設定ページからいつでも解約可能です。解約後は当月末まで引き続きご利用いただけます。</td>
                            </tr>
                            <tr>
                                <th style={{ padding: '10px 8px', textAlign: 'left', whiteSpace: 'nowrap', verticalAlign: 'top', color: '#555' }}>返金について</th>
                                <td style={{ padding: '10px 8px', verticalAlign: 'top' }}>
                                    デジタルコンテンツの性質上、原則として返金はいたしかねます。ただし、弊社のシステム障害等により継続的にサービスをご利用いただけなかった場合は、個別にご対応いたします。
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="legal-modal-footer">
                    <button onClick={onClose}>閉じる</button>
                </div>
            </div>
        </div>
    );
};

export default SpecifiedCommercialTransactions;
