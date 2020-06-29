const
    Path = require('path'),
    FS = require('fs'),
    VersionFile = require('webpack-version-file'),
    Webpack = require('webpack'),
    TerserPlugin = require('terser-webpack-plugin'),
    OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin'),
    ExtractCss = require('mini-css-extract-plugin')


// Load config
// Load config from app root if config file exists (webpack.config.json)
// Else load the default config
const
    appConfigPath = Path.resolve('./webpack.config.json'),
    defaultConfigPath = Path.resolve(__dirname + '/config/webpack.config.json'),
    configPath = FS.existsSync(appConfigPath) ? appConfigPath : defaultConfigPath

let config = require(configPath)



// Determine runtime environment
const env = (() => {
    let env = null, type = null
    process.argv.forEach( arg => {
        if(
            arg.indexOf('--type=') !== -1 &&
            ['development', 'production', 'devserver'].indexOf(type = arg.replace('--type=', '')) !== -1
        )
            env = type
    })
    return env
})()

if(!env){
    console.error("--type must be provided and one of the followings: development, production, devserver")
    process.exit()
}



// Check if there is any dynamic paths for entries
let entriesFiles = []
const getFiles = (path, entriesFiles) => {
    FS.readdirSync(path).forEach( file => {
        let subPath = `${path}/${file}`
        if (FS.lstatSync(subPath).isDirectory()){
            getFiles(subPath, entriesFiles)
        }
        else if (file === 'webpack.entry.json'){
            entriesFiles.push(`${path}/${file}`)
        }
    })
}
getFiles(Path.resolve('.'), entriesFiles)


// Make entries
if (!config.entries || config.entries && !Object.keys(config.entries).length){
    config.entries = {}
}


entriesFiles.forEach( entriesFile => {
    if(FS.existsSync(entriesFile)){
        const entries = require(entriesFile)
        Object.keys(entries).forEach( outFileName => {
            config.entries[outFileName] =
                Path.join(Path.dirname(entriesFile), entries[outFileName])
        })
    }
})

if(Object.keys(config.entries).length > 1 && config.entries['_webpack-entries-example']){
    delete config.entries['_webpack-entries-example']
}


// Loaders
const FileType = {
    ASSET   : /\.(jpe?g|png|gif|svg|eot|ttf|woff|woff2)$/i,
    CSS     : /\.css$/i,
    SASS    : /(\.scss|\.sass)$/i,
    LESS    : /\.less$/i,
    STYLUS  : /\.styl$/i,
    JS      : /\.jsx?$/i,
}

const
    fileLoader = { // copy files into assets folder
        loader: 'file-loader',
        options: {
            name: file => {
                let match, prefix
                prefix = (match = file.match(/node_modules[\\\/](.+?)[\\\/]/i)) ? 'vendors/' + match[1] + '/' : ''
                return prefix + 'assets/[name].[ext]'
            }
        }
    },
    fileLoaderDev = { // copy files into assets folder for dev
        ...fileLoader,
        options: {
            ...fileLoader.options,
            publicPath: `${config.devServer.public}:${config.devServer.port}/` + (config.distPath ? `${config.distPath}/` : '')
        }
    },
    extractCSSLoader = // extract css into separate files
        ExtractCss.loader,
    styleLoader = { // creates style nodes (inline) from JS strings
        loader: 'style-loader',
        /*options: {
            sourceMap: true
        }*/
    },
    cssLoaderNoImport = { // translates CSS into CommonJS
        loader: 'css-loader',
        options: {
            url: true,
            sourceMap: true,
            modules: false
        }
    },
    cssLoader = {
        ...cssLoaderNoImport,
        options: {
            ...cssLoaderNoImport.options,
            modules: {
                //localIdentName: '[path]__[name]__[local]--[hash:base64:5]'
                localIdentName: '[name]__[local]--[hash:base64:5]'
            },
            importLoaders: 2
        }
    },
    postCSSLoader = { // run various CSS modules
        loader: 'postcss-loader',
        options: {
            ident: 'postcss',
            plugins: [ // enable to use next gen css, auto vendor prefix
                require('postcss-preset-env')(),
                require('cssnano')()
            ],
            sourceMap: true
        }
    },
    lessLoader = { // compiles LESS to CSS
        loader: 'less-loader',
        options: {
            sourceMap: true
        }
    },
    sassLoader = { // compiles SASS/SCSS to CSS
        loader: 'sass-loader',
        options: {
            sourceMap: true,
        }
    },
    stylusLoader = { // compiles STYLUS to CSS
        loader: 'stylus-loader',
        options: {
            sourceMap: true
        }
    },
    // transpile ES6 into es5, including react jsx
    babelLoader = {
        loader: 'babel-loader',
        options: {
            presets: [
                '@babel/preset-env',
                '@babel/preset-flow',
                '@babel/preset-react',
                '@babel/preset-typescript'
            ],
            plugins: [
                '@babel/plugin-proposal-object-rest-spread',
                '@babel/plugin-proposal-optional-chaining',
                '@babel/plugin-proposal-class-properties'
            ],
            babelrc: false
        }
    },
    babelLoaderDev = {
        ...babelLoader,
        options: {
            ...babelLoader.options,
            presets: [
                ...babelLoader.options.presets,
            ],
            plugins: [
                ...babelLoader.options.plugins,
                //'react-hot-loader/babel' // necessary not to completely reload react modules
            ]
        }
    }



// Config
let Config = {}

Config.PRODUCTION = {
    mode: 'production',
    performance: {
        hints: false
    },
    entry: {...config.entries},
    output: {
        path: Path.join(Path.resolve('.'), config.contentBase, config.distPath),
        filename: '[name].js'
    },
    resolve: {
        extensions: ['.js', '.jsx']
    },
    optimization: {
        nodeEnv: 'production', // set node env
        minimizer: [
            new TerserPlugin({
                sourceMap: false,
                terserOptions: {
                    warning: false
                }
            }),
            new OptimizeCSSAssetsPlugin({})
        ]

    },
    plugins: [
        new ExtractCss({
            filename: '[name].css'
        }),
        new VersionFile({
            output: Path.join(config.contentBase, config.distPath, 'version.txt'),
            data: {
                buildString: Math.floor(Date.now() / 1000)
            },
            templateString: 'Build: <%= buildString %>\nBuild date: <%= buildDate %>'
        }),
    ],
    module: {
        rules: [
            {
                test: FileType.ASSET,
                use: [ fileLoader ]
            },
            {
                test: FileType.CSS,
                use: [ extractCSSLoader, cssLoaderNoImport, postCSSLoader ]
            },
            {
                test: FileType.SASS,
                use: [ extractCSSLoader, cssLoaderNoImport, postCSSLoader, sassLoader ],
                include: /(node_modules|bower_components)/
            },
            {
                test: FileType.SASS,
                use: [ extractCSSLoader, cssLoader, postCSSLoader, sassLoader ],
                exclude: /(node_modules|bower_components)/
            },
            {
                test: FileType.LESS,
                use: [ extractCSSLoader, cssLoaderNoImport, postCSSLoader, lessLoader ],
                include: /(node_modules|bower_components)/
            },
            {
                test: FileType.LESS,
                use: [ extractCSSLoader, cssLoader, postCSSLoader, lessLoader ],
                exclude: /(node_modules|bower_components)/
            },
            {
                test: FileType.STYLUS,
                use: [ extractCSSLoader, cssLoaderNoImport, postCSSLoader, stylusLoader ],
                include: /(node_modules|bower_components)/
            },
            {
                test: FileType.STYLUS,
                use: [ extractCSSLoader, cssLoader, postCSSLoader, stylusLoader ],
                exclude: /(node_modules|bower_components)/
            },
            {
                test: FileType.JS,
                use: [ babelLoader ],
                exclude: /(node_modules|bower_components)/
            },
        ]
    },
    bail: true
}



Config.DEVELOPMENT = {
    mode: 'development',
    entry: {...config.entries},
    output: {
        path: Path.join(Path.resolve('.'), config.contentBase, config.distPath),
        filename: '[name].js'
    },
    resolve: {
        extensions: ['.js', '.jsx']
    },
    optimization: {
        nodeEnv: 'development', // set node env
    },
    plugins: [
        new ExtractCss({
            filename: '[name].css'
        })
    ],
    devtool: 'inline-source-map',
    module: {
        rules: [
            {
                test: FileType.ASSET,
                use: [ fileLoader ]
            },
            {
                test: FileType.CSS,
                use: [ extractCSSLoader, cssLoaderNoImport, postCSSLoader ]
            },
            {
                test: FileType.SASS,
                use: [ extractCSSLoader, cssLoaderNoImport, postCSSLoader, sassLoader ],
                include: /(node_modules|bower_components)/
            },
            {
                test: FileType.SASS,
                use: [ extractCSSLoader, cssLoader, postCSSLoader, sassLoader ],
                exclude: /(node_modules|bower_components)/
            },
            {
                test: FileType.LESS,
                use: [ extractCSSLoader, cssLoaderNoImport, postCSSLoader, lessLoader ],
                include: /(node_modules|bower_components)/
            },
            {
                test: FileType.LESS,
                use: [ extractCSSLoader, cssLoader, postCSSLoader, lessLoader ],
                exclude: /(node_modules|bower_components)/
            },
            {
                test: FileType.STYLUS,
                use: [ extractCSSLoader, cssLoaderNoImport, postCSSLoader, stylusLoader ],
                include: /(node_modules|bower_components)/
            },
            {
                test: FileType.STYLUS,
                use: [ extractCSSLoader, cssLoader, postCSSLoader, stylusLoader ],
                exclude: /(node_modules|bower_components)/
            },
            {
                test: FileType.JS,
                use: [ babelLoader ],
                exclude: /(node_modules|bower_components)/
            },
        ]
    }
}






let devServer = {}
if(config.devServer.https){
    devServer.https = {...config.devServer.ssl}
    Object.keys(devServer.https).map( key => {
        devServer.https[key] = FS.readFileSync(Path.resolve(devServer.https[key]))
    })
}

Config.DEVSERVER = {
    mode: 'development',
    entry: {
        ...config.entries
    },
    output: {
        path: Path.join(Path.resolve('.'), config.contentBase, config.distPath),
        publicPath: '/' + (config.distPath? config.distPath + '/' : ''),
        filename: '[name].js'
    },
    devServer: {
        headers: { "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
            "Access-Control-Allow-Headers": "X-Requested-With, content-type, Authorization"},
        publicPath: '/' + (config.distPath? config.distPath + '/' : ''),
        contentBase: Path.join(Path.resolve('.'), config.contentBase),
        hot: true, // // add if(module.hot) module.hot.accept() at the end of the entry.js
        hotOnly: false, // true: only refresh modules (not fully page reload)
        host: '0.0.0.0', // accept from anywhere
        sockPort: config.devServer.port,
        port: config.devServer.port,
        disableHostCheck: true,
        compress: true,
        public: config.devServer.public,
        ...devServer
    },
    resolve: {
        extensions: ['.js', '.jsx']
    },
    optimization: {
        nodeEnv: 'development'
    },
    devtool: 'inline-source-map',
    plugins: [
        new Webpack.HotModuleReplacementPlugin(), // enable HHR globally
        new Webpack.NamedModulesPlugin(), // prints more readable module names in the browser console on HHR updates
    ],
    module: {
        rules: [
            {
                test: FileType.ASSET,
                use: [ fileLoaderDev ]
            },
            {
                test: FileType.CSS,
                use: [ styleLoader, cssLoaderNoImport, postCSSLoader ]
            },
            {
                test: FileType.SASS,
                use: [ styleLoader, cssLoaderNoImport, postCSSLoader, sassLoader ],
                include: /(node_modules|bower_components)/
            },
            {
                test: FileType.SASS,
                use: [ styleLoader, cssLoader, postCSSLoader, sassLoader ],
                exclude: /(node_modules|bower_components)/
            },
            {
                test: FileType.LESS,
                use: [ styleLoader, cssLoaderNoImport, postCSSLoader, lessLoader ],
                include: /(node_modules|bower_components)/
            },
            {
                test: FileType.LESS,
                use: [ styleLoader, cssLoader, postCSSLoader, lessLoader ],
                exclude: /(node_modules|bower_components)/
            },
            {
                test: FileType.STYLUS,
                use: [ styleLoader, cssLoaderNoImport, postCSSLoader, stylusLoader ],
                include: /(node_modules|bower_components)/
            },
            {
                test: FileType.STYLUS,
                use: [ styleLoader, cssLoader, postCSSLoader, stylusLoader ],
                exclude: /(node_modules|bower_components)/
            },
            {
                test: FileType.JS,
                use: [ babelLoaderDev ],
                exclude: /(node_modules|bower_components)/
            },
        ]
    }
}



module.exports = () => {
    switch(env){
        case 'production':
            return Config.PRODUCTION
        case 'development':
            return Config.DEVELOPMENT
        case 'devserver':
            return Config.DEVSERVER
    }
}









