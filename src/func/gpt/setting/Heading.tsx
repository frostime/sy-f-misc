const Heading = (prpos: { children }) => {
    return (
        <h3 style={{
            margin: '5px 24px',
            padding: '5px 0',
            "text-align": 'left',
            color: 'var(--b3-theme-primary)',
            "position": "relative",
            "border-radius": 0,
            "border-top": '2px solid var(--b3-theme-primary)',
            "border-bottom": '1px dashed var(--b3-theme-primary)',
        }}>
            {prpos.children}
        </h3>
    )
}

export default Heading;
