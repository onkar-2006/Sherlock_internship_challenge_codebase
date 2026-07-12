import { RefreshCw } from 'lucide-react';
interface HeaderProps {
    onReset: () => void;
    viewMode: 'split' | 'interviewer' | 'candidate';
    setViewMode: (mode: 'split' | 'interviewer' | 'candidate') => void;
}
export function Header({ onReset, viewMode, setViewMode }: HeaderProps) {
    return (
        <header className="app-header">
            <div>
                <h1>Sherlock Real-Time Candidate Identity Detector</h1>
            </div>
            <div className="header-controls">
                <button
                    className={`btn ${viewMode === 'split' ? 'btn-primary' : ''}`}
                    onClick={() => setViewMode('split')}
                >
                    Split View
                </button>
                <button
                    className={`btn ${viewMode === 'interviewer' ? 'btn-primary' : ''}`}
                    onClick={() => setViewMode('interviewer')}
                >
                    Interviewer Panel Only
                </button>
                <button
                    className={`btn ${viewMode === 'candidate' ? 'btn-primary' : ''}`}
                    onClick={() => setViewMode('candidate')}
                >
                    Candidate Panel Only
                </button>
                <button className="btn btn-secondary" onClick={onReset}>
                    <RefreshCw size={16} /> Reset
                </button>
            </div>
        </header>
    );
}
