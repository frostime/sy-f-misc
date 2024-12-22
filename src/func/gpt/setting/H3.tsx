const H3 = (prpos: { children }) => {
    return (
        <h3 style={{
            padding: '5px 20px',
            "text-align": 'center',
            color: 'var(--b3-theme-primary)'
        }}>
            {prpos.children}
        </h3>
    )
}

export default H3;
