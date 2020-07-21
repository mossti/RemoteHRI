import React from 'react'

export default class TwoDWorld extends React.Component {
    render() {
        var worldrobotPosition = {top: this.props.y, left: this.props.x, transform: `rotate(${this.props.angle}deg)`}
        var worldgoalPosition = {top: this.props.goalLocationY, left: this.props.goalLocationX, width: this.props.goalWidth, height: this.props.goalHeight}
        var worldObstacles = this.props.obstacles.map((o) => <div style={{position: "absolute", width: o.width, height: o.height, top: o.locationY, left: o.locationX}} className="grid-obstacle"></div>)
        return (
            <div className="world-container">
                <img id="worldrobot" style={worldrobotPosition} src="worldrobot.png" />
                <div id="worldgoal" style={worldgoalPosition} className="grid-goal"></div>
                {worldObstacles}
            </div>
        )
    }
}