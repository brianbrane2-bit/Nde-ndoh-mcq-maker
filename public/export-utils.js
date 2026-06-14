// Export utilities for results
function exportToCSV(data, filename) {
    const headers = ['Question', 'Your Answer', 'Correct Answer', 'Status', 'Points Earned', 'Explanation'];
    const rows = data.details.map(d => [
        d.question_text,
        d.student_answer,
        d.correct_answer,
        d.is_correct ? 'Correct' : 'Incorrect',
        d.points_earned,
        d.explanation || ''
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function exportToExcel(data, filename) {
    // Create HTML table for Excel
    let html = `
        <html>
        <head>
            <title>Exam Results</title>
            <style>
                th { background: #1B2B4E; color: white; padding: 10px; }
                td { padding: 8px; border: 1px solid #ddd; }
                .correct { color: green; }
                .incorrect { color: red; }
            </style>
        </head>
        <body>
            <h1>Exam Results: ${data.title}</h1>
            <p>Student: ${data.student_name}</p>
            <p>Score: ${data.score} / ${data.total_points} (${Math.round(data.percentage)}%)</p>
            <p>Status: ${data.passed ? 'PASSED' : 'FAILED'}</p>
            <p>Date: ${new Date(data.end_time).toLocaleString()}</p>
            <table border="1" cellpadding="10" cellspacing="0">
                <thead>
                    <tr><th>Question</th><th>Your Answer</th><th>Correct Answer</th><th>Status</th><th>Points</th><th>Explanation</th></tr>
                </thead>
                <tbody>
    `;
    
    data.details.forEach(d => {
        html += `
            <tr>
                <td>${escapeHtml(d.question_text)}</td>
                <td>${d.student_answer || 'Not answered'}</td>
                <td>${d.correct_answer}</td>
                <td class="${d.is_correct ? 'correct' : 'incorrect'}">${d.is_correct ? '✓ Correct' : '✗ Incorrect'}</td>
                <td>${d.points_earned}</td>
                <td>${escapeHtml(d.explanation || '')}</td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </body>
        </html>
    `;
    
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.xls`;
    a.click();
    URL.revokeObjectURL(url);
}

function exportToPDF(data, filename) {
    // Use browser's print functionality
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>Exam Results - ${data.title}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 40px; }
                .header { text-align: center; margin-bottom: 30px; }
                .score { text-align: center; font-size: 24px; margin: 20px 0; }
                .passed { color: green; }
                .failed { color: red; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background: #1B2B4E; color: white; }
                .correct { background: #d4edda; }
                .incorrect { background: #f8d7da; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>${data.title}</h1>
                <p><strong>Student:</strong> ${data.student_name}</p>
                <p><strong>Date:</strong> ${new Date(data.end_time).toLocaleString()}</p>
            </div>
            <div class="score">
                <div>Score: ${data.score} / ${data.total_points}</div>
                <div>Percentage: ${Math.round(data.percentage)}%</div>
                <div class="${data.passed ? 'passed' : 'failed'}">${data.passed ? '✓ PASSED' : '✗ FAILED'}</div>
            </div>
            <table>
                <thead>
                    <tr><th>#</th><th>Question</th><th>Your Answer</th><th>Correct Answer</th><th>Status</th><th>Points</th></tr>
                </thead>
                <tbody>
                    ${data.details.map((d, i) => `
                        <tr class="${d.is_correct ? 'correct' : 'incorrect'}">
                            <td>${i + 1}</td>
                            <td>${escapeHtml(d.question_text)}</td>
                            <td>${d.student_answer || 'Not answered'}</td>
                            <td>${d.correct_answer}</td>
                            <td>${d.is_correct ? '✓' : '✗'}</td>
                            <td>${d.points_earned}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}